import { makeToken, type PassContext } from '../types.js';

// Street addresses. Format: number + street name + suffix. Numeric apartment
// or unit designator (Apt 5B, Suite 200) is captured if present.
const STREET_SUFFIX =
  '(?:St|Street|Ave|Avenue|Blvd|Boulevard|Dr|Drive|Rd|Road|Ln|Lane|Way|Ct|Court|Pl|Place|Cir|Circle|Pkwy|Parkway|Hwy|Highway|Ter|Terrace|Plz|Plaza)';

const ADDRESS_RE = new RegExp(
  `\\b\\d{1,6}\\s+(?:[A-Z][a-zA-Z0-9'.-]*\\s+){1,5}${STREET_SUFFIX}\\.?` +
    `(?:\\s+(?:Apt|Apartment|Suite|Ste|Unit)\\s*[A-Z0-9-]+)?\\b`,
  'g',
);

export function redactAddress(text: string, ctx: PassContext): string {
  return text.replace(ADDRESS_RE, (match) => makeToken(ctx, 'ADDRESS', match));
}

export function detectAddress(text: string): string | null {
  const m = ADDRESS_RE.exec(text);
  ADDRESS_RE.lastIndex = 0;
  return m ? m[0] : null;
}
