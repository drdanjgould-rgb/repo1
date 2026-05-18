/** Kinds of PHI/PII we detect. */
export type PhiKind = 'NAME' | 'EMAIL' | 'PHONE' | 'DOB' | 'ADDRESS' | 'ZIP' | 'MRN';

/** Token → original mapping; the redaction map. */
export type RedactionMap = Record<string, string>;

export interface RedactionResult {
  redacted: string;
  map: RedactionMap;
}

export interface RedactOptions {
  /**
   * Additional first or last names to treat as PHI (clinic-specific). The
   * redactor's built-in name list covers ~200 common US first and last
   * names; if a clinic has staff or patients with names outside the list
   * they can be added here.
   */
  additionalNames?: { first?: string[]; last?: string[] };

  /**
   * Phrases to NOT redact, lowercased on lookup. Useful for known
   * false-positive sources like brand names ("John Deere", "Pat Robertson").
   */
  blocklist?: string[];
}

/**
 * Internal pass context — shared across all pattern passes so a repeated
 * original (e.g., "Sarah Johnson" mentioned twice) gets the same token.
 */
export interface PassContext {
  counters: Map<PhiKind, number>;
  reverse: Map<string, string>;
  map: RedactionMap;
  blocklist: Set<string>;
}

export function makeToken(ctx: PassContext, kind: PhiKind, original: string): string {
  const seen = ctx.reverse.get(original);
  if (seen) return seen;
  const n = (ctx.counters.get(kind) ?? 0) + 1;
  ctx.counters.set(kind, n);
  const token = `<<PHI_${kind}_${String(n).padStart(3, '0')}>>`;
  ctx.reverse.set(original, token);
  ctx.map[token] = original;
  return token;
}
