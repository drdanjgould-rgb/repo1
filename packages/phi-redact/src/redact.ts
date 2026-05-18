import { NAME_BLOCKLIST_DEFAULTS } from './name-list.js';
import {
  redactAddress,
  redactDob,
  redactEmail,
  redactMrn,
  redactName,
  redactPhone,
  redactZip,
} from './patterns/index.js';
import type { PassContext, RedactionResult, RedactOptions } from './types.js';

/**
 * Redact PHI/PII from `text`, returning the redacted string and a map of
 * tokens to their originals. The map is what you pass to `restore()` to
 * undo the substitution.
 *
 * Passes run in fixed order, longest/most-specific first:
 *   1. Email      (contains @)
 *   2. Phone      (specific digit grouping)
 *   3. MRN        (labeled medical IDs)
 *   4. DOB        (labeled DOB or full MM/DD/YYYY birth year)
 *   5. Address    (street + suffix)
 *   6. ZIP        (5- or 5+4-digit, post-phone to avoid digit theft)
 *   7. Name       (Title+Last, FirstLast in lists, intro+First)
 *
 * Same original within one call gets the same token (idempotent within a
 * single redact() invocation). Different invocations are independent.
 */
export function redact(text: string, options?: RedactOptions): RedactionResult {
  const blocklist = new Set<string>(
    [...NAME_BLOCKLIST_DEFAULTS, ...(options?.blocklist ?? [])].map((s) => s.toLowerCase()),
  );
  const ctx: PassContext = {
    counters: new Map(),
    reverse: new Map(),
    map: {},
    blocklist,
  };

  let result = redactEmail(text, ctx);
  result = redactPhone(result, ctx);
  result = redactMrn(result, ctx);
  result = redactDob(result, ctx);
  result = redactAddress(result, ctx);
  result = redactZip(result, ctx);

  const additionalFirst = new Set(
    (options?.additionalNames?.first ?? []).map((n) => n.toLowerCase()),
  );
  const additionalLast = new Set(
    (options?.additionalNames?.last ?? []).map((n) => n.toLowerCase()),
  );
  result = redactName(result, ctx, {
    first: additionalFirst,
    last: additionalLast,
  });

  return { redacted: result, map: ctx.map };
}
