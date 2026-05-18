import { createHmac, timingSafeEqual } from 'node:crypto';
import { err, ok, type IntegrationError, type Result } from '../result.js';
import type {
  MetaClient,
  SendMessageInput,
  SendMessageOutput,
  VerifySignatureInput,
} from './types.js';

export interface MetaClientOptions {
  /** Long-lived Page Access Token. */
  pageAccessToken: string;
  /** Graph API version (default v21.0). */
  apiVersion?: string;
  /** Override for tests. */
  baseUrl?: string;
  /** Per-request timeout in ms. */
  timeoutMs?: number;
}

/**
 * Production Meta Graph API client. We use one method — `sendMessage` for
 * outbound DMs on Instagram / Facebook Page surfaces. Inbound delivery
 * is via webhook (handled by `apps/api`).
 *
 * Errors return as `Result.err`. The Concierge orchestrator decides
 * whether to retry (transient HTTP/network) or escalate (4xx auth /
 * policy denials are not retryable).
 */
export class RealMetaClient implements MetaClient {
  private readonly bearer: string;
  private readonly apiVersion: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(opts: MetaClientOptions) {
    this.bearer = opts.pageAccessToken;
    this.apiVersion = opts.apiVersion ?? 'v21.0';
    this.baseUrl = opts.baseUrl ?? 'https://graph.facebook.com';
    this.timeoutMs = opts.timeoutMs ?? 10_000;
  }

  async sendMessage(input: SendMessageInput): Promise<Result<SendMessageOutput>> {
    const url = `${this.baseUrl}/${this.apiVersion}/${encodeURIComponent(input.pageId)}/messages`;
    const body = {
      recipient: { id: input.recipientPsid },
      messaging_type: 'RESPONSE',
      message: { text: input.text },
    };

    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), this.timeoutMs);
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.bearer}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: ctl.signal,
      });
      const text = await resp.text();
      if (!resp.ok) return err(mapHttpError(resp.status, text));
      const parsed: unknown = text ? safeJsonParse(text) : {};
      const messageId =
        typeof parsed === 'object' && parsed !== null && 'message_id' in parsed
          ? String((parsed as Record<string, unknown>)['message_id'])
          : '';
      return ok({ messageId });
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

/**
 * Verify a Meta webhook payload signature. Per Meta's docs:
 *   header: X-Hub-Signature-256: sha256=<hex>
 *   hex = HMAC-SHA256(body, app_secret)
 *
 * Timing-safe comparison. Returns false on any malformed input.
 */
export function verifyMetaSignature(args: VerifySignatureInput): boolean {
  if (!args.signature || !args.signature.startsWith('sha256=')) return false;
  const received = args.signature.slice('sha256='.length);
  const expected = createHmac('sha256', args.appSecret).update(args.body).digest('hex');
  if (expected.length !== received.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(received));
  } catch {
    return false;
  }
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function mapHttpError(status: number, body: string): IntegrationError {
  if (status === 401 || status === 403) {
    return { kind: 'auth', message: body.slice(0, 200), status, retryable: false };
  }
  if (status === 429)
    return { kind: 'rate_limit', message: 'rate limited', status, retryable: true };
  if (status === 400) {
    return { kind: 'validation', message: body.slice(0, 200), status, retryable: false };
  }
  if (status >= 500) return { kind: 'http', message: `HTTP ${status}`, status, retryable: true };
  return { kind: 'http', message: `HTTP ${status}`, status, retryable: false };
}
