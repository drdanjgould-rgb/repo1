import { describe, expect, it } from 'vitest';
import { runFixture } from '../src/runner.js';
import type { EvalTarget, Fixture } from '../src/types.js';

function targetReplying(text: string, redFlag = false): EvalTarget {
  return {
    run: () => Promise.resolve({ text, redFlag }),
  };
}

function fixture(overrides: Partial<Fixture>): Fixture {
  return {
    id: overrides.id ?? 'test',
    turns: overrides.turns ?? [{ role: 'user', content: 'hi' }],
    expectations: overrides.expectations ?? { must_not_contain_banned: true },
    ...(overrides.description ? { description: overrides.description } : {}),
    ...(overrides.context ? { context: overrides.context } : {}),
  };
}

describe('runFixture — banned phrases', () => {
  it('fails when the response contains a banned phrase', async () => {
    const r = await runFixture(
      fixture({}),
      targetReplying('This is a personal transformation for you.'),
    );
    expect(r.passed).toBe(false);
    const failed = r.checks.find((c) => c.name === 'no_banned_phrases');
    expect(failed?.passed).toBe(false);
    expect(failed?.details).toContain('transformation');
  });

  it('passes when the response is banned-phrase-free', async () => {
    const r = await runFixture(fixture({}), targetReplying('Thanks for reaching out!'));
    const banned = r.checks.find((c) => c.name === 'no_banned_phrases');
    expect(banned?.passed).toBe(true);
  });
});

describe('runFixture — must_not_contain_phrases', () => {
  it('fails when a forbidden phrase appears', async () => {
    const r = await runFixture(
      fixture({
        expectations: {
          must_not_contain_phrases: ['starting at', 'around $'],
        },
      }),
      targetReplying('Pricing is starting at $25,000 for that procedure.'),
    );
    expect(r.passed).toBe(false);
    const c = r.checks.find((x) => x.name.includes('starting at'));
    expect(c?.passed).toBe(false);
  });
});

describe('runFixture — must_contain_any', () => {
  it('fails when none of the required phrases appears', async () => {
    const r = await runFixture(
      fixture({
        expectations: { must_contain_any: ['consultation', 'consult'] },
      }),
      targetReplying("I'd love to help with that."),
    );
    const c = r.checks.find((x) => x.name === 'must_contain_any');
    expect(c?.passed).toBe(false);
  });

  it('passes when at least one phrase appears (case-insensitive)', async () => {
    const r = await runFixture(
      fixture({
        expectations: { must_contain_any: ['consult'] },
      }),
      targetReplying("Let's schedule a Consult."),
    );
    const c = r.checks.find((x) => x.name === 'must_contain_any');
    expect(c?.passed).toBe(true);
  });
});

describe('runFixture — required_behaviors', () => {
  it('passes the contact-capture behavior when the response asks for phone/email', async () => {
    const r = await runFixture(
      fixture({
        expectations: { required_behaviors: ['offers_contact_capture'] },
      }),
      targetReplying('What is the best way to reach you, phone or email?'),
    );
    const c = r.checks.find((x) => x.name === 'offers_contact_capture');
    expect(c?.passed).toBe(true);
  });

  it("fails the contact-capture behavior when the response doesn't ask", async () => {
    const r = await runFixture(
      fixture({
        expectations: { required_behaviors: ['offers_contact_capture'] },
      }),
      targetReplying('Sounds great, talk soon!'),
    );
    const c = r.checks.find((x) => x.name === 'offers_contact_capture');
    expect(c?.passed).toBe(false);
  });

  it('detects price quotes via declines_price behavior', async () => {
    const r = await runFixture(
      fixture({
        expectations: { required_behaviors: ['declines_price'] },
      }),
      targetReplying('It typically costs $30,000.'),
    );
    const c = r.checks.find((x) => x.name === 'declines_price');
    expect(c?.passed).toBe(false);
    expect(c?.details).toContain('$30,000');
  });

  it('flags an unknown behavior name in the fixture', async () => {
    const r = await runFixture(
      fixture({
        expectations: { required_behaviors: ['nope_not_a_behavior'] },
      }),
      targetReplying('hello'),
    );
    expect(r.passed).toBe(false);
    const c = r.checks.find((x) => x.name === 'nope_not_a_behavior');
    expect(c?.details).toContain('unknown behavior');
  });
});

describe('runFixture — escalation', () => {
  it('passes when redFlag matches expectation', async () => {
    const r = await runFixture(
      fixture({ expectations: { must_escalate: true } }),
      targetReplying('holding reply', true),
    );
    expect(r.passed).toBe(true);
    expect(r.checks.find((c) => c.name === 'escalation')?.passed).toBe(true);
  });

  it('fails on a safety miss (expected to escalate, did not)', async () => {
    const r = await runFixture(
      fixture({ expectations: { must_escalate: true } }),
      targetReplying('here is some normal reply', false),
    );
    expect(r.passed).toBe(false);
    expect(r.checks.find((c) => c.name === 'escalation')?.passed).toBe(false);
  });

  it('skips content checks when the fixture escalated as expected', async () => {
    // The holding reply mentions "emergency" which would otherwise match
    // a must_not_contain_phrase. Confirm that check is bypassed.
    const r = await runFixture(
      fixture({
        expectations: {
          must_escalate: true,
          must_not_contain_phrases: ['emergency'],
        },
      }),
      targetReplying('Please call 911 if this is an emergency.', true),
    );
    expect(r.passed).toBe(true);
  });
});

describe('runFixture — target error', () => {
  it('reports a clear failure when the target throws', async () => {
    const errTarget: EvalTarget = {
      run: () => Promise.reject(new Error('boom')),
    };
    const r = await runFixture(fixture({}), errTarget);
    expect(r.passed).toBe(false);
    expect(r.error).toBe('boom');
    expect(r.checks.find((c) => c.name === 'target_did_not_throw')?.passed).toBe(false);
  });
});
