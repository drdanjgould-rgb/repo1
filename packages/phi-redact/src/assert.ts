import { detectDob, detectEmail, detectMrn, detectPhone } from './patterns/index.js';
import type { PhiKind } from './types.js';

/**
 * Thrown by `assertNoPhi` when a high-confidence PHI pattern is detected
 * in text that should be PHI-free. The most common cause is forgetting to
 * call `redact()` before logging or sending to an external LLM.
 */
export class PhiLeakError extends Error {
  constructor(
    public readonly kind: PhiKind,
    public readonly snippet: string,
  ) {
    super(`Suspected PHI leak (${kind}): "${snippet}"`);
    this.name = 'PhiLeakError';
  }
}

/**
 * Check `text` for high-confidence PHI patterns. Throws `PhiLeakError`
 * on hit; otherwise returns.
 *
 * Only high-confidence detectors run (email, phone, MRN, DOB). Name
 * and address detection is too lossy for an assertion — false positives
 * would block legitimate non-PHI log lines.
 *
 * Use this defensively before any operation that must be PHI-free:
 * logging, analytics, non-BAA external LLM calls.
 */
export function assertNoPhi(text: string): void {
  const detectors: Array<{ kind: PhiKind; fn: (s: string) => string | null }> = [
    { kind: 'EMAIL', fn: detectEmail },
    { kind: 'PHONE', fn: detectPhone },
    { kind: 'MRN', fn: detectMrn },
    { kind: 'DOB', fn: detectDob },
  ];
  for (const { kind, fn } of detectors) {
    const hit = fn(text);
    if (hit) throw new PhiLeakError(kind, hit);
  }
}
