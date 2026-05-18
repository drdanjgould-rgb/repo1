/**
 * Concierge CLI simulator.
 *
 *   pnpm dev:concierge
 *
 * Reads `.env.local` (then `.env`) for ANTHROPIC_API_KEY. No DB, no Meta,
 * no Twilio — just stdin → ClaudeClient → stdout. The intended use is
 * prompt iteration: open a terminal, talk to the bot, tweak the system
 * prompt in `src/prompt.ts`, re-run.
 */
import { config as loadEnv } from 'dotenv';
import { existsSync } from 'node:fs';
import readline from 'node:readline/promises';
import { ClaudeClient, createAnthropicTransport, type AgentLogger } from '@contourai/agents';
import { createConciergeAgent } from './agent.js';

for (const path of ['.env.local', '.env']) {
  if (existsSync(path)) loadEnv({ path, override: false });
}

const apiKey = process.env['ANTHROPIC_API_KEY'];
if (!apiKey) {
  process.stderr.write('ANTHROPIC_API_KEY not set. Add it to .env.local or export it.\n');
  process.exit(1);
}

// Tiny logger that writes one summary line per call to STDERR so it doesn't
// interleave with the assistant's response on stdout. Format chosen to be
// quick to eyeball during prompt tuning.
const stderrLogger: AgentLogger = {
  logCall(e) {
    const cache = e.cacheReadTokens > 0 ? ` cache=${e.cacheReadTokens}` : '';
    process.stderr.write(
      `  [${e.model} ${e.latencyMs}ms in=${e.promptTokens} out=${e.completionTokens}${cache} stop=${e.stopReason ?? '?'}]\n`,
    );
  },
};

const client = new ClaudeClient({
  transport: createAnthropicTransport({ apiKey }),
  logger: stderrLogger,
  defaultModule: 'workers/concierge/cli',
});

const agent = createConciergeAgent({ client });

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

process.stdout.write(
  [
    '',
    'ContourAI Concierge — local simulator',
    '  Commands: /quit  /clear  /history',
    '  Anything else is treated as a patient DM.',
    '',
  ].join('\n'),
);

async function main(): Promise<void> {
  for (;;) {
    let line: string;
    try {
      line = (await rl.question('\nYou> ')).trim();
    } catch {
      break; // EOF (Ctrl-D)
    }
    if (!line) continue;
    if (line === '/quit') break;
    if (line === '/clear') {
      agent.clear();
      process.stdout.write('  history cleared\n');
      continue;
    }
    if (line === '/history') {
      process.stdout.write(JSON.stringify(agent.history(), null, 2) + '\n');
      continue;
    }

    try {
      const { text, verdict } = await agent.reply(line);
      if (verdict.redFlag) {
        process.stdout.write(
          `\n  ⚠  Safety triage: ${verdict.category} (severity ${verdict.severity})\n` +
            `     ${verdict.rationale}\n`,
        );
      }
      process.stdout.write(`\nConcierge> ${text}\n`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`\n  ! ${msg}\n`);
    }
  }
  rl.close();
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`fatal: ${msg}\n`);
  process.exit(1);
});
