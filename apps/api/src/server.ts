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
import { ClaudeClient, createAnthropicTransport } from '@contourai/agents';
import { createClient } from '@contourai/db/client';
import {
  drizzleConversationsRepo,
  drizzleEscalationsRepo,
  drizzleLeadScoresRepo,
  drizzleLeadsRepo,
  drizzleMessagesRepo,
  drizzlePatientsRepo,
} from '@contourai/db/repos';
import { RealMailchimpClient, RealMetaClient, RealSheetsClient } from '@contourai/integrations';
import {
  createConciergeAgent,
  createPinoAgentLogger,
  type OrchestratorDeps,
} from '@contourai/worker-concierge';
import { createApp } from './index.js';
import { createInngest } from './inngest/client.js';
import { loadConfig, requireField } from './config.js';

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

/**
 * Production deps factory. Built once at module load (deps are reused
 * across every Inngest invocation in this process). Fails loud at boot
 * if the live path is enabled and required credentials are missing.
 *
 * Per-clinic config (Mailchimp list id, Sheets spreadsheet id) lives in
 * env vars for v1. v2 promotes to a `clinics.settings` JSONB lookup
 * via ClinicsRepo.
 */
function buildProductionDeps(): OrchestratorDeps {
  const env = process.env;

  const databaseUrl = requireField(env['DATABASE_URL'] ?? '', 'DATABASE_URL');
  const { db } = createClient({ url: databaseUrl });

  const anthropicKey = requireField(config.anthropic.apiKey, 'ANTHROPIC_API_KEY');
  const agentLogger = createPinoAgentLogger({ base: { env: env['DEPLOY_ENV'] ?? 'dev' } });
  const claude = new ClaudeClient({
    transport: createAnthropicTransport({ apiKey: anthropicKey }),
    logger: agentLogger,
    defaultModule: 'workers/concierge',
  });

  const mailchimp = new RealMailchimpClient({
    apiKey: requireField(env['MAILCHIMP_API_KEY'] ?? '', 'MAILCHIMP_API_KEY'),
  });
  const sheets = new RealSheetsClient({
    credentials: JSON.parse(
      requireField(env['GOOGLE_SERVICE_ACCOUNT_JSON'] ?? '', 'GOOGLE_SERVICE_ACCOUNT_JSON'),
    ) as { client_email: string; private_key: string },
  });
  const meta = new RealMetaClient({
    pageAccessToken: requireField(config.meta.pageAccessToken, 'META_PAGE_ACCESS_TOKEN'),
  });

  return {
    client: claude,
    agent: createConciergeAgent({ client: claude }),
    repos: {
      conversations: drizzleConversationsRepo(db),
      messages: drizzleMessagesRepo(db),
      escalations: drizzleEscalationsRepo(db),
      patients: drizzlePatientsRepo(db),
      leads: drizzleLeadsRepo(db),
      leadScores: drizzleLeadScoresRepo(db),
    },
    integrations: { mailchimp, sheets, meta },
    clinic: {
      // Single-clinic for v1; multi-tenant resolution lands with ClinicsRepo.
      id: requireField(env['DEFAULT_CLINIC_ID'] ?? '', 'DEFAULT_CLINIC_ID'),
      mailchimpListId: requireField(env['MAILCHIMP_LIST_ID'] ?? '', 'MAILCHIMP_LIST_ID'),
      sheetsSpreadsheetId: requireField(
        env['SHEETS_SPREADSHEET_ID'] ?? '',
        'SHEETS_SPREADSHEET_ID',
      ),
      sheetsRange: env['SHEETS_RANGE'] ?? 'Leads!A1',
    },
  };
}

/**
 * Lazy + memoized — the deps are only constructed when the live path
 * fires. In dry-run mode the throw never happens (no Inngest dispatch
 * means no orchestrator invocation).
 */
let cachedDeps: OrchestratorDeps | null = null;
const getOrchestratorDeps = (): OrchestratorDeps => {
  if (!cachedDeps) cachedDeps = buildProductionDeps();
  return cachedDeps;
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
  // Console mounts only when STAFF_API_TOKEN is set. Reuses the orchestrator
  // DB pool via the same lazy factory.
  ...(config.staffApiToken
    ? {
        console: {
          staffApiToken: config.staffApiToken,
          getDeps: () => {
            const o = getOrchestratorDeps();
            return {
              repos: {
                conversations: o.repos.conversations,
                messages: o.repos.messages,
                escalations: o.repos.escalations,
                leads: o.repos.leads,
              },
              clinic: { id: o.clinic.id },
            };
          },
        },
      }
    : {}),
});

process.stdout.write(
  `ContourAI API listening on :${config.port} (live=${config.liveWebhooksEnabled}, console=${config.staffApiToken ? 'on' : 'off'})\n`,
);
serve({ fetch: app.fetch, port: config.port });
