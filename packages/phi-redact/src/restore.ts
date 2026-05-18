import type { RedactionMap } from './types.js';

/**
 * Replace every token in `text` with its mapped original. Tokens not in
 * the map are left as-is. The replacement uses literal string substitution
 * (no regex parsing) so any token-shaped sequence is safe.
 */
export function restore(text: string, map: RedactionMap): string {
  let result = text;
  for (const [token, original] of Object.entries(map)) {
    if (result.includes(token)) {
      // split/join is the simplest literal replace-all in JS without
      // needing String.prototype.replaceAll (which is available, but
      // costs us a regex.escape on the token).
      result = result.split(token).join(original);
    }
  }
  return result;
}
