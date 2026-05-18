import { makeToken, type PassContext } from '../types.js';

// US-style phone numbers, with or without country code and various separators.
//   (310) 555-1234
//   310-555-1234
//   310.555.1234
//   3105551234
//   +1 (310) 555-1234
//   +1-310-555-1234
const PHONE_RE = /(?<![\d.])(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}(?!\d)/g;

export function redactPhone(text: string, ctx: PassContext): string {
  return text.replace(PHONE_RE, (match) => makeToken(ctx, 'PHONE', match));
}

export function detectPhone(text: string): string | null {
  const m = PHONE_RE.exec(text);
  PHONE_RE.lastIndex = 0;
  return m ? m[0] : null;
}
