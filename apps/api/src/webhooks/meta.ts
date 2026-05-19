import { Hono } from 'hono';
import type { Inngest } from 'inngest';
import { verifyMetaSignature } from '@contourai/integrations/meta';
import type { ConversationPlatform, InboundDMEvent } from '@contourai/worker-concierge';

export interface MetaWebhookDeps {
  inngest: Inngest;
  appSecret: string;
  verifyToken: string;
  /** page-id → clinic-id mapping (provisional until ClinicsRepo lookup lands). */
  clinicByMetaPageId: Record<string, string>;
  /** Whether to actually dispatch the Inngest event. When false, the webhook
   * returns 200 and logs the would-be event but doesn't fire it. */
  liveWebhooksEnabled: boolean;
  /** Logger override for tests. */
  log?: (level: 'info' | 'warn' | 'error', msg: string, ctx?: Record<string, unknown>) => void;
}

export function metaWebhookApp(deps: MetaWebhookDeps): Hono {
  const app = new Hono();
  const log =
    deps.log ??
    ((level, msg, ctx) => {
      process.stdout.write(
        JSON.stringify({ level, msg, ts: new Date().toISOString(), ...ctx }) + '\n',
      );
    });

  // GET — Meta's webhook subscription verification handshake.
  app.get('/', (c) => {
    const mode = c.req.query('hub.mode');
    const token = c.req.query('hub.verify_token');
    const challenge = c.req.query('hub.challenge');
    if (mode === 'subscribe' && token === deps.verifyToken && challenge) {
      return c.text(challenge, 200);
    }
    return c.text('verify_token mismatch', 403);
  });

  // POST — inbound webhook payload.
  app.post('/', async (c) => {
    const raw = await c.req.text();
    const sig = c.req.header('x-hub-signature-256');
    if (!verifyMetaSignature({ body: raw, signature: sig, appSecret: deps.appSecret })) {
      log('warn', 'meta_signature_invalid', { sig_present: Boolean(sig) });
      return c.text('invalid signature', 401);
    }

    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      return c.text('invalid json', 400);
    }

    const events = normalizeMetaPayload(payload, deps.clinicByMetaPageId);
    if (events.length === 0) {
      // No-op payloads (delivery receipts, read receipts) — 200 to ack.
      return c.json({ status: 'noop' });
    }

    if (!deps.liveWebhooksEnabled) {
      log('info', 'meta_webhook_dry_run', { event_count: events.length });
      return c.json({ status: 'dry_run', count: events.length });
    }

    // Fire and forget into Inngest. Meta requires a 200 within 10s.
    for (const ev of events) {
      try {
        // Use platformMsgId as the Inngest event id so Meta webhook retries
        // (same mid twice) are deduplicated at the event-queue layer.
        await deps.inngest.send({
          id: ev.platformMsgId,
          name: 'concierge/inbound.received',
          data: ev,
        });
      } catch (e) {
        log('error', 'inngest_send_failed', {
          err: e instanceof Error ? e.message : String(e),
        });
      }
    }
    return c.json({ status: 'received', count: events.length });
  });

  return app;
}

/**
 * Translate a Meta webhook payload into zero or more `InboundDMEvent`s.
 * Filters out non-messaging events, delivery/read receipts, and any
 * entry whose page-id can't be mapped to a clinic.
 */
export function normalizeMetaPayload(
  payload: unknown,
  clinicByMetaPageId: Record<string, string>,
): InboundDMEvent[] {
  if (typeof payload !== 'object' || payload === null) return [];
  const p = payload as Record<string, unknown>;
  const object = p['object'];
  const entries = p['entry'];
  if (!Array.isArray(entries)) return [];
  const platform: ConversationPlatform =
    object === 'instagram' ? 'instagram' : object === 'page' ? 'instagram' : 'web';

  const out: InboundDMEvent[] = [];
  for (const entry of entries) {
    if (typeof entry !== 'object' || entry === null) continue;
    const e = entry as Record<string, unknown>;
    const pageId = typeof e['id'] === 'string' ? e['id'] : '';
    const clinicId = clinicByMetaPageId[pageId];
    if (!clinicId) continue;

    const messaging = e['messaging'];
    if (!Array.isArray(messaging)) continue;

    for (const m of messaging) {
      if (typeof m !== 'object' || m === null) continue;
      const ev = parseMessagingEvent(m as Record<string, unknown>, {
        clinicId,
        platform,
        pageId,
      });
      if (ev) out.push(ev);
    }
  }
  return out;
}

function parseMessagingEvent(
  m: Record<string, unknown>,
  ctx: { clinicId: string; platform: ConversationPlatform; pageId: string },
): InboundDMEvent | null {
  const sender = m['sender'];
  const message = m['message'];
  if (typeof sender !== 'object' || sender === null) return null;
  if (typeof message !== 'object' || message === null) return null;
  const senderObj = sender as Record<string, unknown>;
  const messageObj = message as Record<string, unknown>;

  const senderId = typeof senderObj['id'] === 'string' ? senderObj['id'] : '';
  const platformMsgId = typeof messageObj['mid'] === 'string' ? messageObj['mid'] : '';
  const text = typeof messageObj['text'] === 'string' ? messageObj['text'] : '';

  // Skip echo, delivery receipts, read receipts, and message reactions —
  // they don't carry `message.text`.
  if (!senderId || !platformMsgId || !text) return null;
  // Skip messages we sent (Meta echoes our outbound in is_echo=true).
  if (messageObj['is_echo'] === true) return null;

  return {
    clinicId: ctx.clinicId,
    platform: ctx.platform,
    threadId: senderId,
    platformMsgId,
    recipientPlatformId: ctx.pageId,
    text,
    sender: { handle: senderId },
  };
}
