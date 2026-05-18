import { makeToken, type PassContext } from '../types.js';

// US ZIP codes (5 digits or 5+4). Must run AFTER phone/MRN/DOB passes so we
// don't steal digits from those longer patterns. Bounded by non-digit on
// both sides so we don't match the tail of a phone number or MRN.
const ZIP_RE = /(?<![\d-])\d{5}(?:-\d{4})?(?![\d-])/g;

export function redactZip(text: string, ctx: PassContext): string {
  return text.replace(ZIP_RE, (match) => makeToken(ctx, 'ZIP', match));
}

export function detectZip(text: string): string | null {
  const m = ZIP_RE.exec(text);
  ZIP_RE.lastIndex = 0;
  return m ? m[0] : null;
}
