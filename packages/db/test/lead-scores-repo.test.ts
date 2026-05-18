import { describe, expect, it } from 'vitest';
import { FakeLeadScoresRepo } from '../src/repos/test-utils/fake-lead-scores.js';

const CLINIC = '00000000-0000-0000-0000-000000000001';
const LEAD = '00000000-0000-0000-0000-000000000020';

describe('FakeLeadScoresRepo', () => {
  it('insert returns the persisted row', async () => {
    const repo = new FakeLeadScoresRepo();
    const r = await repo.insert({
      clinicId: CLINIC,
      leadId: LEAD,
      score: 60,
      reason: 'booking intent +40, phone provided +15',
    });
    expect(r.id).toBeDefined();
    expect(r.score).toBe(60);
  });

  it('historyFor returns oldest-first', async () => {
    const repo = new FakeLeadScoresRepo();
    await repo.insert({
      clinicId: CLINIC,
      leadId: LEAD,
      score: 15,
      reason: 'initial',
      scoredAt: new Date(2026, 0, 1),
    });
    await repo.insert({
      clinicId: CLINIC,
      leadId: LEAD,
      score: 70,
      reason: 'booking intent',
      scoredAt: new Date(2026, 4, 1),
    });
    const history = await repo.historyFor(LEAD);
    expect(history.map((h) => h.score)).toEqual([15, 70]);
  });

  it('historyFor is scoped to one lead', async () => {
    const repo = new FakeLeadScoresRepo();
    await repo.insert({ clinicId: CLINIC, leadId: LEAD, score: 10, reason: 'x' });
    await repo.insert({
      clinicId: CLINIC,
      leadId: '00000000-0000-0000-0000-000000000099',
      score: 50,
      reason: 'y',
    });
    const onlyOne = await repo.historyFor(LEAD);
    expect(onlyOne).toHaveLength(1);
    expect(onlyOne[0]?.leadId).toBe(LEAD);
  });
});
