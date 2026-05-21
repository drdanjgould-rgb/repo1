import { Hono } from 'hono';
import { bearerAuth } from './auth.js';
import type { ConsoleDeps } from './deps.js';

export interface ConsoleAppOptions {
  /** Shared secret protecting every console route. */
  staffApiToken: string;
  /** Lazy: only built if the route is hit. */
  getDeps: () => ConsoleDeps;
}

/**
 * Staff console API surface. Read-only in v0.
 *
 * GET  /api/v1/dashboard/stats
 * GET  /api/v1/escalations
 * GET  /api/v1/conversations
 * GET  /api/v1/conversations/:id   (includes ordered messages)
 * GET  /api/v1/leads
 *
 * Every route is bearer-auth'd. Responses never include
 * `content_original_encrypted` — staff get the redacted text by default;
 * a separate "reveal PHI" endpoint will land with real auth + audit
 * logging in v1.
 */
export function consoleApp(opts: ConsoleAppOptions): Hono {
  const app = new Hono();
  app.use('*', bearerAuth(opts.staffApiToken));

  app.get('/dashboard/stats', async (c) => {
    const { repos, clinic } = opts.getDeps();
    const now = new Date();
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [conversationsToday, openEscalations, leadsByTier] = await Promise.all([
      repos.conversations.countSince({ clinicId: clinic.id, since: dayStart }),
      repos.escalations.listOpen({ clinicId: clinic.id, limit: 1000 }),
      repos.leads.countByTierSince({ clinicId: clinic.id, since: sevenDaysAgo }),
    ]);

    return c.json({
      conversationsToday,
      openEscalations: openEscalations.length,
      leadsByTier,
      asOf: now.toISOString(),
    });
  });

  app.get('/escalations', async (c) => {
    const { repos, clinic } = opts.getDeps();
    const limit = clampLimit(c.req.query('limit'), 50, 200);
    const rows = await repos.escalations.listOpen({ clinicId: clinic.id, limit });
    return c.json({
      items: rows.map((e) => ({
        id: e.id,
        conversationId: e.conversationId,
        reason: e.reason,
        category: e.category,
        severity: e.severity,
        rationale: e.rationale,
        notifiedAt: e.notifiedAt?.toISOString() ?? null,
        createdAt: e.createdAt.toISOString(),
      })),
    });
  });

  app.get('/conversations', async (c) => {
    const { repos, clinic } = opts.getDeps();
    const limit = clampLimit(c.req.query('limit'), 50, 200);
    const status = c.req.query('status');
    const rows = await repos.conversations.listRecent({
      clinicId: clinic.id,
      limit,
      status:
        status === 'open' || status === 'closed' || status === 'escalated' ? status : undefined,
    });
    return c.json({
      items: rows.map((conv) => ({
        id: conv.id,
        platform: conv.platform,
        threadId: conv.threadId,
        status: conv.status,
        lastMessageAt: conv.lastMessageAt?.toISOString() ?? null,
        createdAt: conv.createdAt.toISOString(),
      })),
    });
  });

  app.get('/conversations/:id', async (c) => {
    const { repos, clinic } = opts.getDeps();
    const id = c.req.param('id');
    if (!isUuid(id)) {
      return c.json({ error: 'bad_request', detail: 'id must be a uuid' }, 400);
    }
    const conv = await repos.conversations.findById({ id, clinicId: clinic.id });
    if (!conv) {
      return c.json({ error: 'not_found' }, 404);
    }
    const messages = await repos.messages.recentByConversation({
      conversationId: conv.id,
      limit: 200,
    });
    return c.json({
      conversation: {
        id: conv.id,
        platform: conv.platform,
        threadId: conv.threadId,
        status: conv.status,
        lastMessageAt: conv.lastMessageAt?.toISOString() ?? null,
        createdAt: conv.createdAt.toISOString(),
      },
      messages: messages.map((m) => ({
        id: m.id,
        direction: m.direction,
        role: m.role,
        contentRedacted: m.contentRedacted,
        model: m.model,
        latencyMs: m.latencyMs,
        createdAt: m.createdAt.toISOString(),
      })),
    });
  });

  app.get('/leads', async (c) => {
    const { repos, clinic } = opts.getDeps();
    const limit = clampLimit(c.req.query('limit'), 50, 200);
    const tier = c.req.query('tier');
    const rows = await repos.leads.listRecent({
      clinicId: clinic.id,
      limit,
      tier:
        tier === 'hot' || tier === 'warm' || tier === 'cold' || tier === 'blocked'
          ? tier
          : undefined,
    });
    return c.json({
      items: rows.map((l) => ({
        id: l.id,
        source: l.source,
        score: l.score,
        tier: l.tier,
        status: l.status,
        procedureInterest: l.procedureInterest,
        timeline: l.timeline,
        rawContactRedacted: l.rawContactRedacted,
        createdAt: l.createdAt.toISOString(),
        lastTouchedAt: l.lastTouchedAt?.toISOString() ?? null,
      })),
    });
  });

  return app;
}

function clampLimit(raw: string | undefined, fallback: number, max: number): number {
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, max);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}
