import { makeToken, type PassContext } from '../types.js';

// Medical Record Numbers. EMRs vary wildly; we recognize labels like
// "MRN", "MR#", "Patient ID", "Pt ID", "Chart #" followed by a 4-12 digit
// number. Pure numbers without a label aren't tokenized as MRN — too noisy.
const MRN_RE =
  /\b(?:MRN|MR\s*#|Medical\s+Record(?:\s+(?:Number|No))?|Patient\s+ID|Pt\s+ID|Chart\s*#?)\s*[:\-#]?\s*(\d{4,12})\b/gi;

export function redactMrn(text: string, ctx: PassContext): string {
  return text.replace(MRN_RE, (match) => makeToken(ctx, 'MRN', match));
}

export function detectMrn(text: string): string | null {
  const m = MRN_RE.exec(text);
  MRN_RE.lastIndex = 0;
  return m ? m[0] : null;
}
