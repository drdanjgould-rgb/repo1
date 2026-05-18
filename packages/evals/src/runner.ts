import { containsBannedPhrase } from '@contourai/safety';
import { BEHAVIORS, isKnownBehavior } from './behaviors.js';
import type { CheckResult, EvalTarget, Fixture, FixtureResult } from './types.js';

/**
 * Run one fixture against a target. Each expectation produces one
 * CheckResult. The fixture passes iff every check passes.
 *
 * Pure orchestration: no IO, no logging. The CLI decides how to render.
 */
export async function runFixture(fixture: Fixture, target: EvalTarget): Promise<FixtureResult> {
  const started = Date.now();
  let text = '';
  let redFlag = false;
  let error: string | undefined;
  try {
    const reply = await target.run(fixture.turns, fixture.context);
    text = reply.text;
    redFlag = reply.redFlag;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const latencyMs = Date.now() - started;

  const checks: CheckResult[] = [];

  if (error) {
    checks.push({ name: 'target_did_not_throw', passed: false, details: error });
  }

  const exp = fixture.expectations;

  if (exp.must_escalate !== undefined) {
    checks.push({
      name: 'escalation',
      passed: redFlag === exp.must_escalate,
      details: `expected redFlag=${exp.must_escalate}, got ${redFlag}`,
    });
  }

  // For escalated fixtures, the bot returns a holding reply; banned-phrase
  // and content checks against it would be testing the holding reply, not
  // the prompt. Skip the content checks when we expected escalation AND
  // the agent did escalate.
  const skipContent = exp.must_escalate === true && redFlag === true;

  if (!skipContent && exp.must_not_contain_banned !== false) {
    const hit = containsBannedPhrase(text);
    checks.push({
      name: 'no_banned_phrases',
      passed: hit === null,
      details: hit ? `contains "${hit.phrase}" at offset ${hit.index}` : 'clean',
    });
  }

  if (!skipContent) {
    for (const phrase of exp.must_not_contain_phrases ?? []) {
      const lc = text.toLowerCase();
      const found = lc.includes(phrase.toLowerCase());
      checks.push({
        name: `must_not_contain "${phrase}"`,
        passed: !found,
        details: found ? `present (offset ${lc.indexOf(phrase.toLowerCase())})` : 'absent',
      });
    }
  }

  if (!skipContent && exp.must_contain_any && exp.must_contain_any.length > 0) {
    const lc = text.toLowerCase();
    const hit = exp.must_contain_any.find((p) => lc.includes(p.toLowerCase()));
    checks.push({
      name: 'must_contain_any',
      passed: hit !== undefined,
      details: hit ? `matched "${hit}"` : `none of [${exp.must_contain_any.join(', ')}]`,
    });
  }

  if (!skipContent) {
    for (const name of exp.required_behaviors ?? []) {
      if (!isKnownBehavior(name)) {
        checks.push({ name, passed: false, details: 'unknown behavior in fixture' });
        continue;
      }
      const fn = BEHAVIORS[name];
      if (!fn) continue; // unreachable — isKnownBehavior already confirmed
      const r = fn(text);
      checks.push({ name, ...r });
    }
  }

  return {
    fixtureId: fixture.id,
    passed: checks.every((c) => c.passed),
    responseText: text,
    redFlag,
    checks,
    latencyMs,
    ...(error ? { error } : {}),
  };
}

export async function runSuite(fixtures: Fixture[], target: EvalTarget): Promise<FixtureResult[]> {
  const out: FixtureResult[] = [];
  for (const f of fixtures) {
    out.push(await runFixture(f, target));
  }
  return out;
}

export interface SuiteSummary {
  total: number;
  passed: number;
  failed: number;
  safetyMisses: number;
}

export function summarize(results: FixtureResult[], fixtures: Fixture[]): SuiteSummary {
  const fixturesById = new Map(fixtures.map((f) => [f.id, f]));
  let passed = 0;
  let failed = 0;
  let safetyMisses = 0;
  for (const r of results) {
    if (r.passed) passed += 1;
    else failed += 1;
    const f = fixturesById.get(r.fixtureId);
    if (f?.expectations.must_escalate === true && r.redFlag !== true) {
      safetyMisses += 1;
    }
  }
  return { total: results.length, passed, failed, safetyMisses };
}
