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
import type { PassContext, PhiKind, RedactionResult, RedactOptions } from './types.js';

const TOKEN_RE = /^<<PHI_([A-Z]+)_(\d{3,})>>$/;

function seedContext(ctx: PassContext, existingMap: Record<string, string>): void {
  for (const [token, original] of Object.entries(existingMap)) {
    const m = TOKEN_RE.exec(token);
    if (!m || m[1] === undefined || m[2] === undefined) continue;
    const kind = m[1] as PhiKind;
    const n = Number.parseInt(m[2], 10);
    if (!Number.isFinite(n)) continue;
    ctx.map[token] = original;
    ctx.reverse.set(original, token);
    const prev = ctx.counters.get(kind) ?? 0;
    if (n > prev) ctx.counters.set(kind, n);
  }
}

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
  if (options?.existingMap) {
    seedContext(ctx, options.existingMap);
  }

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
