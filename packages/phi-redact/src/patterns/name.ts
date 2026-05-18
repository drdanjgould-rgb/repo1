import { FIRST_NAMES, LAST_NAMES } from '../name-list.js';
import { makeToken, type PassContext } from '../types.js';

// Title + last name: "Dr. Smith", "Mrs. Garcia", "Mister Lopez".
const TITLE_NAME_RE = /\b(?:Mr|Mrs|Ms|Miss|Dr|Mister|Doctor)\.?\s+([A-Z][a-z]+)\b/g;

// Single capitalized word (used to scan for adjacent name pairs).
const CAPITALIZED_WORD_RE = /\b[A-Z][a-z]+\b/g;

// Self-intro context for single first names. Tokenizes the captured name only.
const INTRO_NAME_RE = /\b(?:my\s+name\s+is|i\s*['']?\s*m|i\s+am|this\s+is)\s+([A-Z][a-z]+)\b/gi;

export function redactName(
  text: string,
  ctx: PassContext,
  extra?: { first?: ReadonlySet<string>; last?: ReadonlySet<string> },
): string {
  const isFirst = (s: string): boolean => {
    const lc = s.toLowerCase();
    return FIRST_NAMES.has(lc) || (extra?.first?.has(lc) ?? false);
  };
  const isLast = (s: string): boolean => {
    const lc = s.toLowerCase();
    return LAST_NAMES.has(lc) || (extra?.last?.has(lc) ?? false);
  };

  let out = text;

  // Pass 1: Title + LastName
  out = out.replace(TITLE_NAME_RE, (match) => {
    if (ctx.blocklist.has(match.toLowerCase())) return match;
    return makeToken(ctx, 'NAME', match);
  });

  // Pass 2: scan for adjacent capitalized word pairs and check both
  // against the name lists. Iterating word-by-word (vs a single
  // alternation regex) handles cases like "Patient Xochitl Smith" where
  // a leading capitalized non-name ("Patient") would otherwise steal the
  // match from the real name that follows.
  out = applyNamePairs(out, ctx, isFirst, isLast);

  // Pass 3: Intro context + single first name (e.g. "my name is Sarah")
  out = out.replace(INTRO_NAME_RE, (match, name: string) => {
    if (!isFirst(name)) return match;
    if (ctx.blocklist.has(name.toLowerCase())) return match;
    const token = makeToken(ctx, 'NAME', name);
    return match.replace(name, token);
  });

  return out;
}

function applyNamePairs(
  text: string,
  ctx: PassContext,
  isFirst: (s: string) => boolean,
  isLast: (s: string) => boolean,
): string {
  type Word = { value: string; start: number; end: number };
  const words: Word[] = [];
  for (const m of text.matchAll(CAPITALIZED_WORD_RE)) {
    const start = m.index ?? 0;
    words.push({ value: m[0], start, end: start + m[0].length });
  }

  type Range = { start: number; end: number; original: string };
  const matches: Range[] = [];
  for (let i = 0; i < words.length - 1; i++) {
    const a = words[i];
    const b = words[i + 1];
    if (!a || !b) continue;
    // Adjacent: only whitespace between them.
    const between = text.slice(a.end, b.start);
    if (!/^\s+$/.test(between)) continue;
    if (!isFirst(a.value) || !isLast(b.value)) continue;
    const original = text.slice(a.start, b.end);
    if (ctx.blocklist.has(original.toLowerCase())) continue;
    matches.push({ start: a.start, end: b.end, original });
    // Skip the next word — it's part of the matched name.
    i += 1;
  }

  // Apply right-to-left so indices stay valid as we rewrite.
  let out = text;
  for (let i = matches.length - 1; i >= 0; i--) {
    const r = matches[i];
    if (!r) continue;
    const token = makeToken(ctx, 'NAME', r.original);
    out = out.slice(0, r.start) + token + out.slice(r.end);
  }
  return out;
}
