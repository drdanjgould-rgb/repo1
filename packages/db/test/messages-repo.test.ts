import { describe, expect, it } from 'vitest';
import { FakeMessagesRepo } from '../src/repos/test-utils/fake-messages.js';

const CLINIC = '00000000-0000-0000-0000-000000000001';
const CONV = '00000000-0000-0000-0000-000000000002';

describe('FakeMessagesRepo', () => {
  it('insert returns the persisted row with an id', async () => {
    const repo = new FakeMessagesRepo();
    const r = await repo.insert({
      conversationId: CONV,
      clinicId: CLINIC,
      direction: 'inbound',
      role: 'patient',
      contentRedacted: 'hi',
    });
    expect(r.id).toBeDefined();
    expect(r.contentRedacted).toBe('hi');
  });

  it('insertIdempotent returns the existing row on platformMsgId collision', async () => {
    const repo = new FakeMessagesRepo();
    const a = await repo.insertIdempotent({
      conversationId: CONV,
      clinicId: CLINIC,
      direction: 'inbound',
      role: 'patient',
      contentRedacted: 'first',
      platformMsgId: 'meta-msg-1',
    });
    const b = await repo.insertIdempotent({
      conversationId: CONV,
      clinicId: CLINIC,
      direction: 'inbound',
      role: 'patient',
      contentRedacted: 'duplicate-attempt',
      platformMsgId: 'meta-msg-1',
    });
    expect(b.id).toBe(a.id);
    expect(b.contentRedacted).toBe('first');
    expect(repo.rows).toHaveLength(1);
  });

  it('recentByConversation returns oldest-first, capped at limit', async () => {
    const repo = new FakeMessagesRepo();
    for (let i = 0; i < 5; i++) {
      await repo.insert({
        conversationId: CONV,
        clinicId: CLINIC,
        direction: i % 2 === 0 ? 'inbound' : 'outbound',
        role: i % 2 === 0 ? 'patient' : 'assistant',
        contentRedacted: `msg ${i}`,
        createdAt: new Date(2026, 4, 1 + i),
      });
    }
    const got = await repo.recentByConversation({ conversationId: CONV, limit: 3 });
    expect(got).toHaveLength(3);
    expect(got[0]?.contentRedacted).toBe('msg 2');
    expect(got[2]?.contentRedacted).toBe('msg 4');
  });

  it('countInboundSince counts only inbound and only after `since`', async () => {
    const repo = new FakeMessagesRepo();
    const earlier = new Date(2026, 0, 1);
    const cutoff = new Date(2026, 4, 1);
    const later = new Date(2026, 4, 10);
    await repo.insert({
      conversationId: CONV,
      clinicId: CLINIC,
      direction: 'inbound',
      role: 'patient',
      contentRedacted: 'old inbound',
      createdAt: earlier,
    });
    await repo.insert({
      conversationId: CONV,
      clinicId: CLINIC,
      direction: 'outbound',
      role: 'assistant',
      contentRedacted: 'outbound new',
      createdAt: later,
    });
    await repo.insert({
      conversationId: CONV,
      clinicId: CLINIC,
      direction: 'inbound',
      role: 'patient',
      contentRedacted: 'new inbound',
      createdAt: later,
    });
    const n = await repo.countInboundSince({ conversationId: CONV, since: cutoff });
    expect(n).toBe(1);
  });
});
