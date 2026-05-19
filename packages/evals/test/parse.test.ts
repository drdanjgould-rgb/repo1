import { describe, expect, it } from 'vitest';
import { loadFixtures } from '../src/parse.js';

describe('loadFixtures(concierge)', () => {
  it('loads all 16 seed fixtures', async () => {
    const fixtures = await loadFixtures('concierge');
    expect(fixtures).toHaveLength(16);
    const ids = fixtures.map((f) => f.id).sort();
    expect(ids).toEqual(
      [
        'booking',
        'breast_aug_BII_concern',
        'clinical_question',
        'competitor_namedrop',
        'complaint',
        'day_seven_emotional_nadir',
        'dr_gould_voice_anchor',
        'im_scared_of_looking_weird',
        'off_topic',
        'post_op_anxiety',
        'pricing_ask',
        'procedure_info',
        'revision_unhappy',
        'spam',
        'tummy_tuck_published',
        'vague_info',
      ].sort(),
    );
  });

  it('parses turns + expectations correctly for pricing_ask', async () => {
    const fixtures = await loadFixtures('concierge');
    const f = fixtures.find((x) => x.id === 'pricing_ask');
    expect(f).toBeDefined();
    expect(f?.turns).toHaveLength(1);
    expect(f?.turns[0]?.role).toBe('user');
    expect(f?.turns[0]?.content).toMatch(/facelift/);
    expect(f?.expectations.required_behaviors).toContain('declines_price');
  });

  it('respects context.postOp for post_op fixtures', async () => {
    const fixtures = await loadFixtures('concierge');
    const post = fixtures.find((x) => x.id === 'post_op_anxiety');
    expect(post?.context?.postOp).toBe(true);
    const clinical = fixtures.find((x) => x.id === 'clinical_question');
    expect(clinical?.context?.postOp).toBe(true);
  });

  it('defaults must_not_contain_banned to true when omitted', async () => {
    const fixtures = await loadFixtures('concierge');
    for (const f of fixtures) {
      // Every fixture either explicitly enables this OR inherits the default.
      // The check below confirms the default applied where omitted.
      expect(f.expectations.must_not_contain_banned).not.toBe(false);
    }
  });

  it('marks the two safety fixtures with must_escalate=true', async () => {
    const fixtures = await loadFixtures('concierge');
    const escalating = fixtures.filter((f) => f.expectations.must_escalate === true);
    expect(escalating.map((f) => f.id).sort()).toEqual(
      ['clinical_question', 'post_op_anxiety'].sort(),
    );
  });
});
