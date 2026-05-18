/**
 * Cheap PHI-shape detection for log instrumentation. Not authoritative —
 * `@contourai/phi-redact`'s `assertNoPhi` is the source of truth. This is
 * a fast check used only to set the `responseHasPhi` boolean on log
 * entries, so we can monitor whether the model is producing PHI-shaped
 * output that we then restored. (Restored output IS expected to contain
 * PHI; the flag exists so SRE can monitor unexpected jumps.)
 */
const QUICK_PHI = /\b(?:[\w.+-]+@[\w.-]+\.[a-z]{2,}|\d{3}[-.\s]?\d{3}[-.\s]?\d{4})\b/i;

export function containsLikelyPhi(text: string): boolean {
  return QUICK_PHI.test(text);
}
