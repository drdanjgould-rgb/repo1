import { describe, expect, it } from 'vitest';
import { ClaudeClient } from '@contourai/agents';
import { FakeTransport } from '@contourai/agents/test-utils';
import {
  FakeConversationsRepo,
  FakeEscalationsRepo,
  FakeLeadScoresRepo,
  FakeLeadsRepo,
  FakeMessagesRepo,
  FakePatientsRepo,
} from '@contourai/db/test-utils';
import {
  FakeMailchimpClient,
  FakeMetaClient,
  FakeSheetsClient,
} from '@contourai/integrations/test-utils';
import { createConciergeAgent } from '../src/agent.js';
import {
  handleInboundDM,
  type InboundDMEvent,
  type OrchestratorDeps,
} from '../src/handlers/handle-inbound-dm.js';

const CLINIC = '00000000-0000-0000-0000-000000000001';

interface Setup {
  deps: OrchestratorDeps;
  conversations: FakeConversationsRepo;
  messages: FakeMessagesRepo;
  escalations: FakeEscalationsRepo;
  patients: FakePatientsRepo;
  leads: FakeLeadsRepo;
  leadScores: FakeLeadScoresRepo;
  mailchimp: FakeMailchimpClient;
  sheets: FakeSheetsClient;
  meta: FakeMetaClient;
  transport: FakeTransport;
}

function setup(args: {
  generationReply?: string;
  intent?: { intent: string; urgency: number; asked_for_human: boolean; procedure?: string };
  noLlmCalls?: boolean;
}): Setup {
  const transport = args.noLlmCalls
    ? FakeTransport.from()
    : FakeTransport.from(
        {
          content: [{ type: 'text', text: args.generationReply ?? 'Thanks for reaching out!' }],
        },
        {
          content: [
            {
              type: 'tool_use',
              id: 'tu_1',
              name: 'classify',
              input: args.intent ?? {
                intent: 'other',
                urgency: 1,
                asked_for_human: false,
              },
            },
          ],
          stop_reason: 'tool_use',
        },
      );
  const client = new ClaudeClient({ transport });
  const agent = createConciergeAgent({ client });

  const conversations = new FakeConversationsRepo();
  const messages = new FakeMessagesRepo();
  const escalations = new FakeEscalationsRepo();
  const patients = new FakePatientsRepo();
  const leads = new FakeLeadsRepo();
  const leadScores = new FakeLeadScoresRepo();
  const mailchimp = new FakeMailchimpClient();
  const sheets = new FakeSheetsClient();
  const meta = new FakeMetaClient();

  const deps: OrchestratorDeps = {
    client,
    agent,
    repos: { conversations, messages, escalations, patients, leads, leadScores },
    integrations: { mailchimp, sheets, meta },
    clinic: {
      id: CLINIC,
      mailchimpListId: 'list-1',
      sheetsSpreadsheetId: 'sheet-1',
      sheetsRange: 'Leads!A1',
    },
  };
  return {
    deps,
    conversations,
    messages,
    escalations,
    patients,
    leads,
    leadScores,
    mailchimp,
    sheets,
    meta,
    transport,
  };
}

function inbound(overrides: Partial<InboundDMEvent> = {}): InboundDMEvent {
  return {
    clinicId: CLINIC,
    platform: 'instagram',
    threadId: 'ig-thread-1',
    platformMsgId: 'meta-msg-1',
    recipientPlatformId: 'ig-page-001',
    text: 'hi, how much is a deep plane facelift?',
    sender: { email: 'sarah@example.com', displayName: 'Sarah Johnson' },
    ...overrides,
  };
}

describe('handleInboundDM — happy path', () => {
  it('replies + returns the intent + tier + score from the orchestrator', async () => {
    const s = setup({
      generationReply:
        'Pricing depends on the specifics — happy to help. What is the best way to reach you, phone or email?',
      intent: {
        intent: 'booking',
        urgency: 4,
        asked_for_human: false,
        procedure: 'deep plane facelift',
      },
    });
    const r = await handleInboundDM(s.deps, inbound());
    if (r.kind !== 'replied') throw new Error(`expected replied, got ${r.kind}`);
    expect(r.intent).toBe('booking');
    // booking (40) + named_procedure (15) = 55 → warm tier.
    expect(r.tier).toBe('warm');
    expect(r.score).toBe(55);
  });

  it('persists exactly one inbound + one outbound message', async () => {
    const s = setup({
      generationReply: 'Thanks! Reach out at phone or email when ready.',
      intent: { intent: 'booking', urgency: 4, asked_for_human: false },
    });
    await handleInboundDM(s.deps, inbound());
    expect(s.messages.rows).toHaveLength(2);
    expect(s.messages.rows[0]?.direction).toBe('inbound');
    expect(s.messages.rows[1]?.direction).toBe('outbound');
  });

  it('redacts PHI in the persisted inbound message', async () => {
    const s = setup({
      generationReply: 'Got it.',
      intent: { intent: 'other', urgency: 1, asked_for_human: false },
    });
    await handleInboundDM(
      s.deps,
      inbound({ text: 'Hi, I am Sarah Johnson. My number is 310-555-1234.' }),
    );
    const inboundRow = s.messages.rows[0];
    expect(inboundRow?.contentRedacted).not.toContain('Sarah Johnson');
    expect(inboundRow?.contentRedacted).not.toContain('310-555-1234');
    expect(inboundRow?.contentRedacted).toMatch(/<<PHI_/);
  });

  it('mirrors a row to Sheets', async () => {
    const s = setup({
      generationReply: 'Reach out at phone or email when ready.',
      intent: { intent: 'booking', urgency: 4, asked_for_human: false, procedure: 'rhino' },
    });
    await handleInboundDM(s.deps, inbound());
    expect(s.sheets.calls).toHaveLength(1);
    expect(s.sheets.calls[0]?.range).toBe('Leads!A1');
  });

  it('enrolls hot/warm leads in Mailchimp; cold leads not enrolled', async () => {
    // Booking intent (40) + named_procedure (15) + provided email = warm at minimum.
    // With booking alone we hit 40 = warm. Should enroll.
    const warm = setup({
      generationReply: 'Got it!',
      intent: { intent: 'booking', urgency: 4, asked_for_human: false },
    });
    await handleInboundDM(warm.deps, inbound());
    expect(warm.mailchimp.upsertCalls).toHaveLength(1);

    const cold = setup({
      generationReply: 'Got it!',
      intent: { intent: 'other', urgency: 1, asked_for_human: false },
    });
    await handleInboundDM(cold.deps, inbound());
    expect(cold.mailchimp.upsertCalls).toHaveLength(0);
  });

  it('inserts a lead_scores history row each turn', async () => {
    const s = setup({
      generationReply: 'Got it.',
      intent: { intent: 'pricing', urgency: 2, asked_for_human: false },
    });
    await handleInboundDM(s.deps, inbound());
    expect(s.leadScores.rows).toHaveLength(1);
  });
});

describe('handleInboundDM — red-flag triage', () => {
  it('escalates without calling the LLM when the inbound matches a regex red flag', async () => {
    const s = setup({ noLlmCalls: true });
    const r = await handleInboundDM(
      s.deps,
      inbound({ text: 'I am bleeding through the dressing right now' }),
    );
    expect(r.kind).toBe('escalated');
    if (r.kind !== 'escalated') throw new Error();
    expect(r.holdingReply).toMatch(/911|emergency/i);
    expect(s.transport.calls).toHaveLength(0);
    expect(s.escalations.rows).toHaveLength(1);
    const conv = [...s.conversations.byId.values()][0];
    expect(conv?.status).toBe('escalated');
    // No lead, no Mailchimp, no Sheets for escalations.
    expect(s.leads.byId.size).toBe(0);
    expect(s.mailchimp.upsertCalls).toHaveLength(0);
    expect(s.sheets.calls).toHaveLength(0);
  });
});

describe('handleInboundDM — spam', () => {
  it('silently drops spam: no reply persisted, no lead, no integrations called', async () => {
    const s = setup({
      generationReply: 'spam reply',
      intent: { intent: 'spam', urgency: 1, asked_for_human: false },
    });
    const r = await handleInboundDM(s.deps, inbound({ text: 'FREE BITCOIN VISIT LINK' }));
    expect(r.kind).toBe('silently_dropped');
    if (r.kind === 'silently_dropped') expect(r.reason).toBe('spam');
    // Inbound IS persisted (we keep the record); outbound is NOT.
    expect(s.messages.rows.filter((m) => m.direction === 'outbound')).toHaveLength(0);
    expect(s.leads.byId.size).toBe(0);
    expect(s.mailchimp.upsertCalls).toHaveLength(0);
    expect(s.sheets.calls).toHaveLength(0);
  });
});

describe('handleInboundDM — idempotency', () => {
  it('is safe to call twice with the same platformMsgId', async () => {
    const s = setup({
      generationReply: 'first reply',
      intent: { intent: 'pricing', urgency: 2, asked_for_human: false },
    });
    await handleInboundDM(s.deps, inbound());

    // Second call with the same platformMsgId must not re-persist the inbound.
    // (It will, however, generate a fresh outbound reply — that's the worker
    // job's behavior. The webhook layer dedups upstream; here we just verify
    // inbound idempotency in the messages table.)
    const s2 = setup({
      generationReply: 'second reply',
      intent: { intent: 'pricing', urgency: 2, asked_for_human: false },
    });
    // Reuse the same fake repos by reaching into deps:
    s2.deps.repos = s.deps.repos;
    await handleInboundDM(s2.deps, inbound());

    const inboundRows = s.messages.rows.filter((m) => m.direction === 'inbound');
    expect(inboundRows).toHaveLength(1);
  });
});

describe('handleInboundDM — banned-phrase post-filter', () => {
  it('escalates and swaps in a holding reply when the model emits a banned phrase', async () => {
    const s = setup({
      generationReply: 'Imagine the transformation you will feel.',
      intent: { intent: 'pricing', urgency: 2, asked_for_human: false },
    });
    const r = await handleInboundDM(s.deps, inbound());
    expect(r.kind).toBe('escalated');
    if (r.kind !== 'escalated') throw new Error();
    expect(r.holdingReply).not.toContain('transformation');
    expect(s.escalations.rows[0]?.reason).toBe('compliance');
  });
});

describe('handleInboundDM — LLM failure', () => {
  it('fails safely: holding reply + escalation row when the agent throws', async () => {
    // FakeTransport with no scripted responses → throws on the agent call.
    const s = setup({ noLlmCalls: true });
    // Inbound is benign so safety triage clears; the agent call then throws.
    const r = await handleInboundDM(s.deps, inbound({ text: 'how much for a consult?' }));
    expect(r.kind).toBe('failed_safely');
    if (r.kind !== 'failed_safely') throw new Error();
    expect(r.holdingReply).toMatch(/team|emergency/i);
    expect(s.escalations.rows).toHaveLength(1);
    expect(s.escalations.rows[0]?.reason).toBe('other');
  });
});
