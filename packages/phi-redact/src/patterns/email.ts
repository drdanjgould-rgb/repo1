import { makeToken, type PassContext } from '../types.js';

// Pragmatic email regex. Not RFC-perfect but covers all common forms and
// errs toward over-redaction (which is the correct bias for PHI).
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

export function redactEmail(text: string, ctx: PassContext): string {
  return text.replace(EMAIL_RE, (match) => makeToken(ctx, 'EMAIL', match));
}

export function detectEmail(text: string): string | null {
  const m = EMAIL_RE.exec(text);
  EMAIL_RE.lastIndex = 0;
  return m ? m[0] : null;
}
