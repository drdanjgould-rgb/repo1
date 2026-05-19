import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { Inngest } from 'inngest';
import { metaWebhookApp, normalizeMetaPayload } from '../src/webhooks/meta.js';

const APP_SECRET = 'test-app-secret';
const VERIFY_TOKEN = 'test-verify-token';
const PAGE_ID = 'ig-page-001';
const CLINIC_ID = '00000000-0000-0000-0000-000000000001';

function sign(body: string): string {
  return 'sha256=' + createHmac('sha256', APP_SECRET).update(body).digest('hex');
}

interface RecordedEvent {
  id?: string;
  name: string;
  data: unknown;
}

/** Minimal in-memory Inngest stub that records sends without throwing. */
function fakeInngest(): { inngest: Inngest; sent: RecordedEvent[] } {
  const sent: RecordedEvent[] = [];
  const stub = {
    send: (e: RecordedEvent | RecordedEvent[]) => {
      const events = Array.isArray(e) ? e : [e];
      for (const ev of events) sent.push(ev);
      return Promise.resolve({
        ids: events.map((_, i) => `evt-${sent.length - events.length + i}`),
      });
    },
  };
  return { inngest: stub as unknown as Inngest, sent };
}

function buildApp(args: { live: boolean; clinicMap?: Record<string, string> }) {
  const { inngest, sent } = fakeInngest();
  const app = metaWebhookApp({
    inngest,
    appSecret: APP_SECRET,
    verifyToken: VERIFY_TOKEN,
    clinicByMetaPageId: args.clinicMap ?? { [PAGE_ID]: CLINIC_ID },
    liveWebhooksEnabled: args.live,
    log: () => undefined,
  });
  return { app, sent };
}

const inboundPayload = (overrides: Record<string, unknown> = {}) => ({
  object: 'instagram',
  entry: [
    {
      id: PAGE_ID,
      time: 1700000000,
      messaging: [
        {
          sender: { id: 'patient-igsid-001' },
          recipient: { id: PAGE_ID },
          timestamp: 1700000000,
          message: {
            mid: 'meta-msg-001',
            text: 'Hi, how much is a deep plane facelift?',
            ...overrides,
          },
        },
      ],
    },
  ],
});

describe('GET /webhooks/meta — subscription verification', () => {
  it('echoes hub.challenge when verify_token matches', async () => {
    const { app } = buildApp({ live: true });
    const resp = await app.request(
      `/?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=abc123`,
    );
    expect(resp.status).toBe(200);
    expect(await resp.text()).toBe('abc123');
  });

  it('rejects a wrong verify_token with 403', async () => {
    const { app } = buildApp({ live: true });
    const resp = await app.request('/?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=abc');
    expect(resp.status).toBe(403);
  });
});

describe('POST /webhooks/meta — signature verification', () => {
  it('rejects requests with a missing or invalid signature', async () => {
    const { app } = buildApp({ live: true });
    const body = JSON.stringify(inboundPayload());
    const resp = await app.request('/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });
    expect(resp.status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    const { app } = buildApp({ live: true });
    const body = JSON.stringify(inboundPayload());
    const goodSig = sign(body);
    const resp = await app.request('/', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': goodSig },
      body: body + ' tampered',
    });
    expect(resp.status).toBe(401);
  });
});

describe('POST /webhooks/meta — normalization & dispatch', () => {
  it('dispatches one Inngest event per messaging entry in live mode', async () => {
    const { app, sent } = buildApp({ live: true });
    const body = JSON.stringify(inboundPayload());
    const resp = await app.request('/', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': sign(body) },
      body,
    });
    expect(resp.status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.name).toBe('concierge/inbound.received');
    const data = sent[0]?.data as { clinicId: string; platformMsgId: string; text: string };
    expect(data.clinicId).toBe(CLINIC_ID);
    expect(data.platformMsgId).toBe('meta-msg-001');
    expect(data.text).toContain('deep plane facelift');
  });

  it('sets Inngest event id = platformMsgId for cross-retry dedup', async () => {
    const { app, sent } = buildApp({ live: true });
    const body = JSON.stringify(inboundPayload());
    await app.request('/', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': sign(body) },
      body,
    });
    expect(sent[0]).toMatchObject({
      id: 'meta-msg-001',
      name: 'concierge/inbound.received',
    });
  });

  it('threads pageId through as recipientPlatformId', async () => {
    const { app, sent } = buildApp({ live: true });
    const body = JSON.stringify(inboundPayload());
    await app.request('/', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': sign(body) },
      body,
    });
    const data = sent[0]?.data as { recipientPlatformId: string };
    expect(data.recipientPlatformId).toBe(PAGE_ID);
  });

  it('does NOT dispatch when liveWebhooksEnabled is false', async () => {
    const { app, sent } = buildApp({ live: false });
    const body = JSON.stringify(inboundPayload());
    const resp = await app.request('/', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': sign(body) },
      body,
    });
    expect(resp.status).toBe(200);
    const json = (await resp.json()) as { status: string; count: number };
    expect(json.status).toBe('dry_run');
    expect(json.count).toBe(1);
    expect(sent).toHaveLength(0);
  });

  it('drops echo messages (is_echo: true)', async () => {
    const { app, sent } = buildApp({ live: true });
    const body = JSON.stringify(inboundPayload({ is_echo: true }));
    const resp = await app.request('/', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': sign(body) },
      body,
    });
    expect(resp.status).toBe(200);
    const json = (await resp.json()) as { status: string };
    expect(json.status).toBe('noop');
    expect(sent).toHaveLength(0);
  });

  it('skips entries whose page_id has no clinic mapping', async () => {
    const { app, sent } = buildApp({ live: true, clinicMap: {} });
    const body = JSON.stringify(inboundPayload());
    const resp = await app.request('/', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': sign(body) },
      body,
    });
    expect(resp.status).toBe(200);
    expect(sent).toHaveLength(0);
  });
});

describe('normalizeMetaPayload', () => {
  it('drops delivery/read receipts (no message.text)', () => {
    const events = normalizeMetaPayload(
      {
        object: 'instagram',
        entry: [
          {
            id: PAGE_ID,
            messaging: [
              {
                sender: { id: 's' },
                recipient: { id: PAGE_ID },
                delivery: { mids: ['x'] },
              },
              { sender: { id: 's' }, recipient: { id: PAGE_ID }, read: { watermark: 1 } },
            ],
          },
        ],
      },
      { [PAGE_ID]: CLINIC_ID },
    );
    expect(events).toHaveLength(0);
  });

  it('returns [] on a non-object payload', () => {
    expect(normalizeMetaPayload(null, {})).toHaveLength(0);
    expect(normalizeMetaPayload('garbage', {})).toHaveLength(0);
    expect(normalizeMetaPayload([], {})).toHaveLength(0);
  });
});
