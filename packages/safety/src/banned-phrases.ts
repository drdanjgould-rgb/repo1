/**
 * System-wide banned phrases. Same list referenced in CLAUDE.md.
 *
 * These are enforced in three layers (per the spec):
 *   1. The system prompt tells the model not to use them.
 *   2. The eval banned-phrase scan fails CI on regression.
 *   3. `containsBannedPhrase()` is the post-generation regex filter the
 *      Concierge worker calls before sending — catches the rare slip.
 *
 * "rejuvenate" is treated as banned in all its forms. The spec calls out
 * "as a standalone claim" but the operational rule we ship is simpler:
 * the word doesn't appear in patient-facing output. Knowledge docs use
 * "restore", "refresh", "tighten", "lift" as approved alternatives.
 */
export const BANNED_PHRASES: readonly string[] = [
  'transformation',
  'reset',
  'anti-aging',
  'antiaging',
  'best version of yourself',
  'journey',
  'rejuvenate',
  'rejuvenated',
  'rejuvenates',
  'rejuvenation',
] as const;

const BANNED_RE = new RegExp(`\\b(?:${BANNED_PHRASES.map(escape).join('|')})\\b`, 'i');

export interface BannedPhraseHit {
  phrase: string;
  index: number;
}

/**
 * Returns the first banned phrase found in `text`, or null if clean.
 * Case-insensitive. Use this before sending any outbound patient-facing
 * message and in any eval that scores tone.
 */
export function containsBannedPhrase(text: string): BannedPhraseHit | null {
  const m = BANNED_RE.exec(text);
  if (!m) return null;
  return { phrase: m[0].toLowerCase(), index: m.index };
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
