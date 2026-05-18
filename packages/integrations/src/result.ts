/**
 * Result<T, E>. Every external-client method returns one of these. We do
 * not throw across integration boundaries: a failed Mailchimp sync must
 * not block the Concierge from replying to the next patient.
 *
 * Callers decide what to do with errors (log, retry, escalate). The
 * choice does not belong to the client.
 */
export type Result<T, E = IntegrationError> = { ok: true; value: T } | { ok: false; error: E };

export interface IntegrationError {
  /** Stable identifier for log/metric correlation. */
  kind: 'http' | 'auth' | 'rate_limit' | 'validation' | 'timeout' | 'network' | 'unknown';
  /** Human-readable message; safe to log. */
  message: string;
  /** Upstream status code if the failure was an HTTP response. */
  status?: number;
  /** Whether the caller is allowed to retry. */
  retryable: boolean;
}

export function ok<T>(value: T): { ok: true; value: T } {
  return { ok: true, value };
}

export function err(error: IntegrationError): { ok: false; error: IntegrationError } {
  return { ok: false, error };
}
