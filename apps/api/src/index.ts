import { serve as inngestServe } from 'inngest/hono';
import { Hono } from 'hono';
import type { Inngest } from 'inngest';
import { metaWebhookApp, type MetaWebhookDeps } from './webhooks/meta.js';
import { makeHandleInboundDMFn } from './inngest/functions/handle-inbound-dm.js';
import type { OrchestratorDeps } from '@contourai/worker-concierge';

export interface CreateAppOptions {
  inngest: Inngest;
  meta: Omit<MetaWebhookDeps, 'inngest'>;
  /** Production deps for the durable function. Tests inject fakes. */
  getOrchestratorDeps: () => OrchestratorDeps;
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

  return app;
}

export { metaWebhookApp, normalizeMetaPayload } from './webhooks/meta.js';
export { createInngest, type InngestEvents } from './inngest/client.js';
export { makeHandleInboundDMFn } from './inngest/functions/handle-inbound-dm.js';
export { loadConfig, requireField, type ApiConfig } from './config.js';
