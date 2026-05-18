/**
 * Production entrypoint.
 *
 *   pnpm --filter @contourai/api dev   # tsx watch
 *   pnpm --filter @contourai/api start # one-shot
 *
 * Loads .env.local (then .env), validates required env vars depending
 * on LIVE_WEBHOOKS_ENABLED, builds the Hono app, and listens on PORT.
 *
 * Note: the OrchestratorDeps factory below intentionally throws when
 * the live path is enabled but real DB/integration creds are missing.
 * This is a fail-loud boot — better than starting a server that would
 * silently drop production traffic.
 */
import { config as loadEnv } from 'dotenv';
import { existsSync } from 'node:fs';
import { serve } from '@hono/node-server';
import { createApp } from './index.js';
import { createInngest } from './inngest/client.js';
import { loadConfig } from './config.js';
import type { OrchestratorDeps } from '@contourai/worker-concierge';

for (const path of ['.env.local', '.env']) {
  if (existsSync(path)) loadEnv({ path, override: false });
}

const config = loadConfig();

const inngest = createInngest({
  appId: 'contourai-api',
  eventKey: config.inngest.eventKey,
  signingKey: config.inngest.signingKey,
  // When LIVE_WEBHOOKS_ENABLED is false we still register the Inngest function
  // (so the dev server can introspect it) but flag dev mode so dispatch is
  // local-only.
  isDev: !config.liveWebhooksEnabled,
});

const getOrchestratorDeps = (): OrchestratorDeps => {
  throw new Error(
    'production OrchestratorDeps factory not yet wired. ' +
      'Build it from @contourai/db (real Postgres) + @contourai/integrations ' +
      "(real Mailchimp/Sheets/Meta) + @contourai/agents (real Anthropic) in step 6's follow-up.",
  );
};

const app = createApp({
  inngest,
  meta: {
    appSecret: config.meta.appSecret,
    verifyToken: config.meta.verifyToken,
    clinicByMetaPageId: config.clinicByMetaPageId,
    liveWebhooksEnabled: config.liveWebhooksEnabled,
  },
  getOrchestratorDeps,
});

process.stdout.write(
  `ContourAI API listening on :${config.port} (live=${config.liveWebhooksEnabled})\n`,
);
serve({ fetch: app.fetch, port: config.port });
