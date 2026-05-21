import { describe, expect, it } from 'vitest';
import {
  FakeConversationsRepo,
  FakeEscalationsRepo,
  FakeLeadsRepo,
  FakeMessagesRepo,
} from '@contourai/db/test-utils';
import { consoleApp } from '../src/console/routes.js';
import type { ConsoleDeps } from '../src/console/deps.js';

const CLINIC = '00000000-0000-0000-0000-000000000001';
const TOKEN = 'staff-secret-token';

interface Setup {
  app: ReturnType<typeof consoleApp>;
  deps: ConsoleDeps;
  conversations: FakeConversationsRepo;
  messages: FakeMessagesRepo;
  escalations: FakeEscalationsRepo;
  leads: FakeLeadsRepo;
}

function setup(): Setup {
  const conversations = new FakeConversationsRepo();
  const messages = new FakeMessagesRepo();
  const escalations = new FakeEscalationsRepo();
  const leads = new FakeLeadsRepo();
  const deps: ConsoleDeps = {
    repos: { conversations, messages, escalations, leads },
    clinic: { id: CLINIC },
  };
  const app = consoleApp({ staffApiToken: TOKEN, getDeps: () => deps });
  return { app, deps, conversations, messages, escalations, leads };
}

function authed(path: string, init?: RequestInit): Request {
  return new Request(`http://localhost${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      authorization: `Bearer ${TOKEN}`,
    },
  });
}

describe('console — auth', () => {
  it('401s requests with no Authorization header', async () => {
    const s = setup();
    const res = await s.app.fetch(new Request('http://localhost/escalations'));
    expect(res.status).toBe(401);
  });

  it('401s requests with the wrong token', async () => {
    const s = setup();
    const res = await s.app.fetch(
      new Request('http://localhost/escalations', {
        headers: { authorization: 'Bearer wrong' },
      }),
    );
    expect(res.status).toBe(401);
  });

  it('200s requests with the right token', async () => {
    const s = setup();
    const res = await s.app.fetch(authed('/escalations'));
    expect(res.status).toBe(200);
  });
});

describe('console — GET /escalations', () => {
  it('returns open escalations for the clinic, newest first', async () => {
    const s = setup();
    await s.escalations.insert({
      clinicId: CLINIC,
      reason: 'red_flag_medical',
      category: 'post_op_complication',
      severity: 4,
      rationale: 'bleeding through dressing',
      createdAt: new Date('2026-05-20T10:00:00Z'),
    });
    await s.escalations.insert({
      clinicId: CLINIC,
      reason: 'compliance',
      category: 'none',
      severity: 2,
      rationale: 'banned phrase emitted',
      createdAt: new Date('2026-05-21T10:00:00Z'),
    });
    const res = await s.app.fetch(authed('/escalations'));
    const body = (await res.json()) as { items: { reason: string }[] };
    expect(body.items).toHaveLength(2);
    expect(body.items[0]?.reason).toBe('compliance');
    expect(body.items[1]?.reason).toBe('red_flag_medical');
  });

  it('does not leak other clinics escalations', async () => {
    const s = setup();
    await s.escalations.insert({
      clinicId: '00000000-0000-0000-0000-000000000099',
      reason: 'other',
    });
    const res = await s.app.fetch(authed('/escalations'));
    const body = (await res.json()) as { items: unknown[] };
    expect(body.items).toHaveLength(0);
  });
});

describe('console — GET /conversations', () => {
  it('returns recent conversations, optionally filtered by status', async () => {
    const s = setup();
    const conv1 = await s.conversations.create({
      clinicId: CLINIC,
      platform: 'instagram',
      threadId: 't-1',
      status: 'open',
      lastMessageAt: new Date('2026-05-20T10:00:00Z'),
    });
    const conv2 = await s.conversations.create({
      clinicId: CLINIC,
      platform: 'instagram',
      threadId: 't-2',
      status: 'escalated',
      lastMessageAt: new Date('2026-05-21T10:00:00Z'),
    });

    const all = (await (await s.app.fetch(authed('/conversations'))).json()) as {
      items: { id: string }[];
    };
    expect(all.items.map((i) => i.id)).toEqual([conv2.id, conv1.id]);

    const escalated = (await (
      await s.app.fetch(authed('/conversations?status=escalated'))
    ).json()) as { items: { id: string }[] };
    expect(escalated.items.map((i) => i.id)).toEqual([conv2.id]);
  });
});

describe('console — GET /conversations/:id', () => {
  it('returns the conversation with ordered messages', async () => {
    const s = setup();
    const conv = await s.conversations.create({
      clinicId: CLINIC,
      platform: 'instagram',
      threadId: 't-1',
      status: 'open',
    });
    await s.messages.insert({
      clinicId: CLINIC,
      conversationId: conv.id,
      direction: 'inbound',
      role: 'patient',
      contentRedacted: 'hi how much is a facelift',
      createdAt: new Date('2026-05-21T10:00:00Z'),
    });
    await s.messages.insert({
      clinicId: CLINIC,
      conversationId: conv.id,
      direction: 'outbound',
      role: 'assistant',
      contentRedacted: 'pricing depends on the specifics',
      model: 'claude-sonnet-4-6',
      latencyMs: 850,
      createdAt: new Date('2026-05-21T10:00:05Z'),
    });

    const res = await s.app.fetch(authed(`/conversations/${conv.id}`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      conversation: { id: string };
      messages: { direction: string; role: string }[];
    };
    expect(body.conversation.id).toBe(conv.id);
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0]?.direction).toBe('inbound');
    expect(body.messages[1]?.direction).toBe('outbound');
  });

  it('404s for unknown id', async () => {
    const s = setup();
    const res = await s.app.fetch(authed('/conversations/00000000-0000-0000-0000-0000000000ff'));
    expect(res.status).toBe(404);
  });

  it('400s for malformed id', async () => {
    const s = setup();
    const res = await s.app.fetch(authed('/conversations/not-a-uuid'));
    expect(res.status).toBe(400);
  });

  it('does not return conversations from other clinics', async () => {
    const s = setup();
    const conv = await s.conversations.create({
      clinicId: '00000000-0000-0000-0000-000000000099',
      platform: 'instagram',
      threadId: 't-1',
      status: 'open',
    });
    const res = await s.app.fetch(authed(`/conversations/${conv.id}`));
    expect(res.status).toBe(404);
  });
});

describe('console — GET /dashboard/stats', () => {
  it('returns counts of open escalations + conversations today + leads by tier', async () => {
    const s = setup();
    const now = new Date();
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);

    await s.conversations.create({
      clinicId: CLINIC,
      platform: 'instagram',
      threadId: 't-1',
      lastMessageAt: new Date(dayStart.getTime() + 60 * 60 * 1000),
    });
    await s.conversations.create({
      clinicId: CLINIC,
      platform: 'instagram',
      threadId: 't-2',
      // Yesterday — should not count.
      lastMessageAt: new Date(dayStart.getTime() - 60 * 60 * 1000),
    });
    await s.escalations.insert({ clinicId: CLINIC, reason: 'red_flag_medical' });
    await s.leads.create({ clinicId: CLINIC, source: 'instagram', tier: 'hot' });
    await s.leads.create({ clinicId: CLINIC, source: 'instagram', tier: 'warm' });
    await s.leads.create({ clinicId: CLINIC, source: 'instagram', tier: 'warm' });

    const res = await s.app.fetch(authed('/dashboard/stats'));
    const body = (await res.json()) as {
      conversationsToday: number;
      openEscalations: number;
      leadsByTier: Record<string, number>;
    };
    expect(body.conversationsToday).toBe(1);
    expect(body.openEscalations).toBe(1);
    expect(body.leadsByTier.hot).toBe(1);
    expect(body.leadsByTier.warm).toBe(2);
    expect(body.leadsByTier.cold).toBe(0);
  });
});
