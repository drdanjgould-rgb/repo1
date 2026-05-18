import { makeToken, type PassContext } from '../types.js';

// Birth-shaped dates. Two paths:
//   1. Labeled DOB: "DOB:", "Date of Birth:", "Born:"
//   2. Bare MM/DD/YYYY or MM-DD-YYYY with a 4-digit year between 1900-2024.
//
// "May 2026" or "next Tuesday" do NOT trigger.
const LABELED_DOB_RE =
  /\b(?:DOB|D\.O\.B\.?|Date\s+of\s+Birth|Born)\s*[:\-]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|[A-Z][a-z]+\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4})/g;

// Bare numeric date, narrowed to a plausible birth year window. We refuse
// to redact dates in the future or > 130 years ago (more likely a typo).
const BARE_DATE_RE = /\b(\d{1,2})[/-](\d{1,2})[/-](19\d{2}|20[01]\d|202[0-4])\b/g;

export function redactDob(text: string, ctx: PassContext): string {
  let out = text.replace(LABELED_DOB_RE, (match) => makeToken(ctx, 'DOB', match));
  out = out.replace(BARE_DATE_RE, (match, mm: string, dd: string) => {
    const monthNum = Number(mm);
    const dayNum = Number(dd);
    if (monthNum < 1 || monthNum > 12) return match;
    if (dayNum < 1 || dayNum > 31) return match;
    return makeToken(ctx, 'DOB', match);
  });
  return out;
}

export function detectDob(text: string): string | null {
  const labeled = LABELED_DOB_RE.exec(text);
  LABELED_DOB_RE.lastIndex = 0;
  if (labeled) return labeled[0];
  const bare = BARE_DATE_RE.exec(text);
  BARE_DATE_RE.lastIndex = 0;
  return bare ? bare[0] : null;
}
