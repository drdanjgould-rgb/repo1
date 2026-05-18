import { createHash } from 'node:crypto';
import { err, ok, type IntegrationError, type Result } from '../result.js';
import type { AddTagsInput, MailchimpClient, MailchimpMember, UpsertMemberInput } from './types.js';

export interface MailchimpClientOptions {
  /** Form: `<key>-<dc>`, e.g. `abc123-us20`. */
  apiKey: string;
  /** Override for tests; production uses the inferred URL. */
  baseUrl?: string;
  /** Per-request timeout in ms. */
  timeoutMs?: number;
}

/**
 * Production Mailchimp client. Wraps the v3 REST API. Operations we use:
 *
 *   - PUT /lists/{list_id}/members/{subscriber_hash}      upsert by email
 *   - POST /lists/{list_id}/members/{subscriber_hash}/tags add/remove tags
 *
 * Auth is HTTP Basic: any username, password = API key.
 *
 * Errors are returned as `Result.err` — we do not throw. The Concierge
 * sync worker decides whether to retry or escalate.
 */
export class RealMailchimpClient implements MailchimpClient {
  private readonly baseUrl: string;
  private readonly authHeader: string;
  private readonly timeoutMs: number;

  constructor(opts: MailchimpClientOptions) {
    const dcMatch = opts.apiKey.match(/-(?<dc>[a-z]+\d+)$/);
    const dc = dcMatch?.groups?.['dc'];
    if (!dc && !opts.baseUrl) {
      throw new Error('Mailchimp apiKey must include a `-<datacenter>` suffix (e.g. "abc-us20")');
    }
    this.baseUrl = opts.baseUrl ?? `https://${dc}.api.mailchimp.com/3.0`;
    // Mailchimp accepts any non-empty username for Basic auth.
    this.authHeader = `Basic ${Buffer.from(`anystring:${opts.apiKey}`).toString('base64')}`;
    this.timeoutMs = opts.timeoutMs ?? 10_000;
  }

  async upsertMember(input: UpsertMemberInput): Promise<Result<MailchimpMember>> {
    const hash = subscriberHash(input.email);
    const url = `${this.baseUrl}/lists/${input.listId}/members/${hash}`;
    const body: Record<string, unknown> = {
      email_address: input.email,
      status_if_new: input.status ?? 'subscribed',
    };
    const mergeFields: Record<string, string> = {};
    if (input.firstName) mergeFields['FNAME'] = input.firstName;
    if (input.lastName) mergeFields['LNAME'] = input.lastName;
    Object.assign(mergeFields, input.mergeFields ?? {});
    if (Object.keys(mergeFields).length > 0) body['merge_fields'] = mergeFields;

    const res = await this.request('PUT', url, body);
    if (!res.ok) return res;
    const json = res.value as Record<string, unknown>;
    return ok({
      email: typeof json['email_address'] === 'string' ? json['email_address'] : input.email,
      tags: Array.isArray(json['tags'])
        ? json['tags']
            .filter(
              (t): t is { name: string } => typeof t === 'object' && t !== null && 'name' in t,
            )
            .map((t) => String(t.name))
        : undefined,
    });
  }

  async addTags(input: AddTagsInput): Promise<Result<void>> {
    const hash = subscriberHash(input.email);
    const url = `${this.baseUrl}/lists/${input.listId}/members/${hash}/tags`;
    const body = {
      tags: input.tags.map((name) => ({ name, status: 'active' })),
    };
    const res = await this.request('POST', url, body);
    if (!res.ok) return res;
    return ok(undefined);
  }

  private async request(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    url: string,
    body: unknown,
  ): Promise<Result<unknown>> {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), this.timeoutMs);
    try {
      const resp = await fetch(url, {
        method,
        headers: {
          Authorization: this.authHeader,
          'Content-Type': 'application/json',
        },
        body: method === 'GET' ? undefined : JSON.stringify(body),
        signal: ctl.signal,
      });
      if (resp.status === 204) return ok(undefined);
      const text = await resp.text();
      const parsed: unknown = text ? safeJsonParse(text) : undefined;
      if (!resp.ok) {
        return err(mapHttpError(resp.status, parsed));
      }
      return ok(parsed);
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

export function subscriberHash(email: string): string {
  return createHash('md5').update(email.toLowerCase()).digest('hex');
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function mapHttpError(status: number, body: unknown): IntegrationError {
  const message =
    typeof body === 'object' && body !== null && 'detail' in body
      ? String((body as Record<string, unknown>)['detail'])
      : `HTTP ${status}`;
  if (status === 401 || status === 403) return { kind: 'auth', message, status, retryable: false };
  if (status === 429) return { kind: 'rate_limit', message, status, retryable: true };
  if (status === 400 || status === 422)
    return { kind: 'validation', message, status, retryable: false };
  if (status >= 500) return { kind: 'http', message, status, retryable: true };
  return { kind: 'http', message, status, retryable: false };
}
