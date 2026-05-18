import { describe, expect, it } from 'vitest';
import { FakeConversationsRepo } from '../src/repos/test-utils/fake-conversations.js';

const CLINIC = '00000000-0000-0000-0000-000000000001';

describe('FakeConversationsRepo', () => {
  it('returns null when no conversation exists for a thread', async () => {
    const repo = new FakeConversationsRepo();
    const got = await repo.findByThread({
      clinicId: CLINIC,
      platform: 'instagram',
      threadId: 't1',
    });
    expect(got).toBeNull();
  });

  it('creates and then finds a conversation by thread', async () => {
    const repo = new FakeConversationsRepo();
    const created = await repo.create({
      clinicId: CLINIC,
      platform: 'instagram',
      threadId: 't1',
    });
    const found = await repo.findByThread({
      clinicId: CLINIC,
      platform: 'instagram',
      threadId: 't1',
    });
    expect(found?.id).toBe(created.id);
  });

  it('enforces (clinic, platform, thread) uniqueness on create', async () => {
    const repo = new FakeConversationsRepo();
    await repo.create({ clinicId: CLINIC, platform: 'instagram', threadId: 't1' });
    await expect(
      repo.create({ clinicId: CLINIC, platform: 'instagram', threadId: 't1' }),
    ).rejects.toThrow(/duplicate/);
  });

  it('allows the same thread_id across different platforms', async () => {
    const repo = new FakeConversationsRepo();
    await repo.create({ clinicId: CLINIC, platform: 'instagram', threadId: 't1' });
    await expect(
      repo.create({ clinicId: CLINIC, platform: 'tiktok', threadId: 't1' }),
    ).resolves.toBeDefined();
  });

  it('touch updates last_message_at', async () => {
    const repo = new FakeConversationsRepo();
    const c = await repo.create({ clinicId: CLINIC, platform: 'instagram', threadId: 't1' });
    const at = new Date('2026-05-18T12:00:00Z');
    await repo.touch({ id: c.id, at });
    const found = await repo.findByThread({
      clinicId: CLINIC,
      platform: 'instagram',
      threadId: 't1',
    });
    expect(found?.lastMessageAt?.toISOString()).toBe(at.toISOString());
  });

  it('setStatus changes status to escalated', async () => {
    const repo = new FakeConversationsRepo();
    const c = await repo.create({ clinicId: CLINIC, platform: 'instagram', threadId: 't1' });
    await repo.setStatus({ id: c.id, status: 'escalated' });
    const found = await repo.findByThread({
      clinicId: CLINIC,
      platform: 'instagram',
      threadId: 't1',
    });
    expect(found?.status).toBe('escalated');
  });
});
