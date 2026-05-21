import { serve as inngestServe } from 'inngest/hono';
import { Hono } from 'hono';
import type { Inngest } from 'inngest';
import { metaWebhookApp, type MetaWebhookDeps } from './webhooks/meta.js';
import { makeHandleInboundDMFn } from './inngest/functions/handle-inbound-dm.js';
import { consoleApp } from './console/routes.js';
import type { ConsoleDeps } from './console/deps.js';
import type { OrchestratorDeps } from '@contourai/worker-concierge';

export interface CreateAppOptions {
  inngest: Inngest;
  meta: Omit<MetaWebhookDeps, 'inngest'>;
  /** Production deps for the durable function. Tests inject fakes. */
  getOrchestratorDeps: () => OrchestratorDeps;
  /**
   * Optional staff-console wire-up. Omit to disable `/api/v1/*` entirely
   * (the routes simply aren't mounted). Tests can mount with fakes.
   */
  console?: {
    staffApiToken: string;
    getDeps: () => ConsoleDeps;
  };
}

/**
 * Build the Hono app. Production calls this once at boot; tests call it
 * per scenario with fakes.
 */
export function createApp(opts: CreateAppOptions): Hono {
  const app = new Hono();

  app.get('/healthz', (c) => c.json({ status: 'ok' }));

  // Webhook surfaces. One per channel; today only Meta is wired.
  app.route('/webhooks/meta', metaWebhookApp({ ...opts.meta, inngest: opts.inngest }));

  // Inngest endpoint — this is where the Inngest cloud (or dev server)
  // both registers functions and invokes them via signed POSTs.
  const inngestFn = makeHandleInboundDMFn({
    inngest: opts.inngest,
    getDeps: opts.getOrchestratorDeps,
  });
  app.on(
    ['GET', 'POST', 'PUT'],
    '/inngest',
    inngestServe({ client: opts.inngest, functions: [inngestFn] }),
  );

  // Staff console (read-only) — gated by Bearer token. Skipped if not configured.
  if (opts.console) {
    app.route('/api/v1', consoleApp(opts.console));
  }

  return app;
}

export { metaWebhookApp, normalizeMetaPayload } from './webhooks/meta.js';
export { createInngest, type InngestEvents } from './inngest/client.js';
export { makeHandleInboundDMFn } from './inngest/functions/handle-inbound-dm.js';
export { loadConfig, requireField, type ApiConfig } from './config.js';
export { consoleApp } from './console/routes.js';
export { bearerAuth } from './console/auth.js';
export type { ConsoleDeps } from './console/deps.js';
