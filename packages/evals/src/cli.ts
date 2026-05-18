/**
 * Eval CLI.
 *
 *   pnpm --filter @contourai/evals eval:concierge
 *   pnpm eval:concierge        # root alias
 *
 * Loads the Concierge fixture suite from fixtures/concierge/, runs each
 * fixture against a real Claude (Sonnet 4.6 by default) wrapped by
 * ClaudeClient, and prints a pass/fail report. Exits non-zero on any
 * failure so CI can gate on it.
 *
 * If ANTHROPIC_API_KEY is unset, prints a skip notice and exits 0 with
 * a warning. Local prompt iteration needs the key; CI mock-mode runs
 * the runner unit tests (test/runner.test.ts) instead.
 */
import { config as loadEnv } from 'dotenv';
import { existsSync } from 'node:fs';
import { ClaudeClient, createAnthropicTransport } from '@contourai/agents';
import { conciergeTarget } from './concierge-target.js';
import { loadFixtures } from './parse.js';
import { runSuite, summarize } from './runner.js';

for (const p of ['.env.local', '.env']) {
  if (existsSync(p)) loadEnv({ path: p, override: false });
}

async function main(): Promise<void> {
  const suite = process.argv[2] ?? 'concierge';
  if (suite !== 'concierge') {
    process.stderr.write(`unknown suite: ${suite}\n`);
    process.exit(2);
  }

  const fixtures = await loadFixtures(suite);
  process.stdout.write(`Loaded ${fixtures.length} fixtures from suite "${suite}".\n\n`);

  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) {
    process.stderr.write(
      'ANTHROPIC_API_KEY not set; skipping LLM run. Add to .env.local to run for real.\n',
    );
    process.exit(0);
  }

  const client = new ClaudeClient({
    transport: createAnthropicTransport({ apiKey }),
    defaultModule: 'evals/concierge',
  });
  const target = conciergeTarget({ client });

  const results = await runSuite(fixtures, target);

  for (const r of results) {
    const mark = r.passed ? '✓' : '✗';
    process.stdout.write(`${mark} ${r.fixtureId}  (${r.latencyMs ?? 0}ms)\n`);
    if (!r.passed) {
      for (const c of r.checks.filter((x) => !x.passed)) {
        process.stdout.write(`    ✗ ${c.name}: ${c.details}\n`);
      }
      process.stdout.write(`    response:\n      ${r.responseText.split('\n').join('\n      ')}\n`);
    }
  }

  const summary = summarize(results, fixtures);
  process.stdout.write(
    `\n${summary.passed}/${summary.total} passed, ${summary.failed} failed, ` +
      `${summary.safetyMisses} safety misses.\n`,
  );

  if (summary.safetyMisses > 0) {
    process.stderr.write(
      'SAFETY MISS: a must-escalate fixture did not escalate. This is the highest-severity failure.\n',
    );
    process.exit(2);
  }
  if (summary.failed > 0) process.exit(1);
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`fatal: ${msg}\n`);
  process.exit(1);
});
