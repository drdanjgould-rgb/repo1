import { JWT } from 'google-auth-library';
import { err, ok, type IntegrationError, type Result } from '../result.js';
import type { AppendRowInput, AppendRowOutput, SheetsClient } from './types.js';

export interface SheetsClientOptions {
  /** Service-account JSON contents (parsed). */
  credentials: {
    client_email: string;
    private_key: string;
  };
  /** Per-request timeout in ms. */
  timeoutMs?: number;
  /** Override for tests. Production uses the standard Google endpoint. */
  baseUrl?: string;
}

/**
 * Production Google Sheets client. Implements only `appendRow` —
 * the Concierge worker's mirror-to-Sheets failsafe doesn't need more.
 *
 * Auth: service-account JWT, scopes
 *   https://www.googleapis.com/auth/spreadsheets
 * Token caching is delegated to google-auth-library.
 *
 * Errors are returned as `Result.err` — we do not throw. Sheets is the
 * MVP failsafe; if it's broken, the Concierge keeps replying.
 */
export class RealSheetsClient implements SheetsClient {
  private readonly jwt: JWT;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(opts: SheetsClientOptions) {
    this.jwt = new JWT({
      email: opts.credentials.client_email,
      key: opts.credentials.private_key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    this.baseUrl = opts.baseUrl ?? 'https://sheets.googleapis.com';
    this.timeoutMs = opts.timeoutMs ?? 10_000;
  }

  async appendRow(input: AppendRowInput): Promise<Result<AppendRowOutput>> {
    let token: string | null | undefined;
    try {
      const tokenResp = await this.jwt.getAccessToken();
      token = tokenResp.token;
    } catch (e) {
      return err({
        kind: 'auth',
        message: e instanceof Error ? e.message : 'auth failure',
        retryable: false,
      });
    }
    if (!token) {
      return err({ kind: 'auth', message: 'no access token returned', retryable: false });
    }

    const url =
      `${this.baseUrl}/v4/spreadsheets/${encodeURIComponent(input.spreadsheetId)}` +
      `/values/${encodeURIComponent(input.range)}:append` +
      `?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
    const body = { values: [input.values.map((v) => String(v))] };

    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), this.timeoutMs);
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: ctl.signal,
      });
      const text = await resp.text();
      if (!resp.ok) {
        return err(mapHttpError(resp.status, text));
      }
      const updatedRow = parseUpdatedRow(text, input.range);
      return ok({ updatedRow });
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        return err({ kind: 'timeout', message: 'request timed out', retryable: true });
      }
      return err({
        kind: 'network',
        message: e instanceof Error ? e.message : String(e),
        retryable: true,
      });
    } finally {
      clearTimeout(t);
    }
  }
}

function parseUpdatedRow(body: string, fallbackRange: string): number {
  try {
    const obj: unknown = JSON.parse(body);
    if (obj !== null && typeof obj === 'object') {
      const o = obj as Record<string, unknown>;
      const updates = o['updates'];
      if (updates !== null && typeof updates === 'object') {
        const updatedRange = (updates as Record<string, unknown>)['updatedRange'];
        if (typeof updatedRange === 'string') {
          // Format: "Sheet1!A5:D5" — pick the trailing row number.
          const m = updatedRange.match(/(\d+):/);
          if (m?.[1]) return Number(m[1]);
        }
      }
    }
  } catch {
    /* fall through */
  }
  const m = fallbackRange.match(/(\d+)/);
  return m?.[1] ? Number(m[1]) : 0;
}

function mapHttpError(status: number, body: string): IntegrationError {
  if (status === 401 || status === 403) {
    return { kind: 'auth', message: body || `HTTP ${status}`, status, retryable: false };
  }
  if (status === 429) {
    return { kind: 'rate_limit', message: 'rate limited', status, retryable: true };
  }
  if (status === 400) {
    return { kind: 'validation', message: body || 'bad request', status, retryable: false };
  }
  if (status >= 500) {
    return { kind: 'http', message: `HTTP ${status}`, status, retryable: true };
  }
  return { kind: 'http', message: `HTTP ${status}`, status, retryable: false };
}
