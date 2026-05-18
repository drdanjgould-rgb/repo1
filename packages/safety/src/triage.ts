import { RED_FLAG_PATTERNS } from './patterns.js';
import type {
  CustomRedFlag,
  QuickTriageOptions,
  RedFlagPattern,
  SafetyVerdict,
  Severity,
} from './types.js';

const NO_FLAG: SafetyVerdict = {
  redFlag: false,
  category: 'none',
  severity: 1,
  rationale: 'no patterns matched',
  patterns: [],
};

/**
 * Synchronous regex-only triage. Sub-millisecond. The floor of the
 * safety pipeline; the LLM ceiling layer (in packages/agents) wraps this
 * for the cases where regex over- or under-flags.
 *
 * Bias: any built-in pattern hit is authoritative for "escalate." The
 * downstream LLM call (when available) can downgrade hypotheticals and
 * quoted speech, but must NEVER promote a no-hit to a hit — only the
 * regex (or its custom extension) can introduce a red flag.
 */
export function quickTriage(text: string, opts?: QuickTriageOptions): SafetyVerdict {
  const patterns: RedFlagPattern[] = [
    ...RED_FLAG_PATTERNS,
    ...(opts?.additionalRedFlags ?? []).map(toPattern),
  ];

  const hits: RedFlagPattern[] = [];
  for (const p of patterns) {
    if (p.postOpOnly && !opts?.postOp) continue;
    if (p.re.test(text)) hits.push(p);
  }

  if (hits.length === 0) return NO_FLAG;

  // Highest severity wins; ties broken by earliest pattern in the list.
  hits.sort((a, b) => b.severity - a.severity);
  const top = hits[0];
  if (!top) return NO_FLAG; // unreachable — TS narrowing

  const bumped: Severity = opts?.postOp ? clampSeverity(top.severity + 1) : top.severity;
  const ids = hits.map((h) => h.id);

  return {
    redFlag: true,
    category: top.category,
    severity: bumped,
    rationale: `regex match: ${ids.join(', ')}`,
    patterns: ids,
  };
}

function toPattern(spec: CustomRedFlag, index: number): RedFlagPattern {
  const re =
    spec.pattern instanceof RegExp
      ? spec.pattern
      : new RegExp(spec.pattern, spec.pattern.match(/[A-Z]/) ? '' : 'i');
  return {
    id: `custom_${index}`,
    re,
    category: spec.category,
    severity: spec.severity,
    postOpOnly: spec.postOpOnly,
  };
}

function clampSeverity(n: number): Severity {
  if (n >= 5) return 5;
  if (n <= 1) return 1;
  return n as Severity;
}
