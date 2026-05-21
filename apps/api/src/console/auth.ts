import type { Context, MiddlewareHandler, Next } from 'hono';

/**
 * Bearer-token gate for the staff console. v0 auth: a single shared
 * secret in env (`STAFF_API_TOKEN`). v1 lands real Supabase Auth with
 * per-user identities and audit-trail-able actor strings.
 *
 * Constant-time comparison so timing oracles don't leak the token.
 */
export function bearerAuth(token: string): MiddlewareHandler {
  if (!token) {
    throw new Error('bearerAuth: token is required (set STAFF_API_TOKEN)');
  }
  const expected = Buffer.from(token, 'utf8');

  return async (c: Context, next: Next) => {
    const header = c.req.header('authorization') ?? '';
    const match = /^Bearer\s+(.+)$/i.exec(header);
    if (!match || !match[1]) {
      return c.json({ error: 'unauthorized', detail: 'missing bearer token' }, 401);
    }
    const got = Buffer.from(match[1], 'utf8');
    if (got.length !== expected.length || !timingSafeEqual(got, expected)) {
      return c.json({ error: 'unauthorized', detail: 'invalid bearer token' }, 401);
    }
    await next();
    return undefined;
  };
}

function timingSafeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}
