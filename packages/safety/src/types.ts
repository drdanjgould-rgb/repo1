/**
 * Categories of clinical / safety red flags. The category drives the
 * escalation route (e.g., mental_health goes to a specific staff queue;
 * medical_emergency triggers an immediate alert).
 */
export type RedFlagCategory =
  | 'medical_emergency'
  | 'post_op_complication'
  | 'mental_health'
  | 'none';

export type Severity = 1 | 2 | 3 | 4 | 5;

export interface SafetyVerdict {
  /** True if this message should escalate to staff. */
  redFlag: boolean;
  category: RedFlagCategory;
  severity: Severity;
  /** Human-readable explanation; surfaces in audit_log + staff alerts. */
  rationale: string;
  /** Pattern IDs that fired. Empty if the verdict came purely from an LLM. */
  patterns: string[];
}

export interface QuickTriageOptions {
  /**
   * Patient is in a post-op window (pre_op or post_op_d0_d14). Lowers the
   * threshold: post-op-only patterns fire, and matched severity gets a
   * +1 bump (capped at 5). Symptoms that are normal in a non-surgical
   * context become urgent post-surgery.
   */
  postOp?: boolean;

  /**
   * Clinic-specific red flags. The `pattern` is run case-insensitively if
   * given as a string; regex patterns are used as-is. Custom patterns are
   * tagged `custom_<index>` in the resulting verdict.
   */
  additionalRedFlags?: ReadonlyArray<CustomRedFlag>;
}

export interface CustomRedFlag {
  pattern: string | RegExp;
  category: Exclude<RedFlagCategory, 'none'>;
  severity: Severity;
  /** Whether this pattern only fires when the patient is post-op. */
  postOpOnly?: boolean;
}

/**
 * Internal: a fully-resolved pattern (built-in or custom-derived).
 */
export interface RedFlagPattern {
  id: string;
  re: RegExp;
  category: Exclude<RedFlagCategory, 'none'>;
  severity: Severity;
  postOpOnly?: boolean;
}

/**
 * Full classifier contract. `quickTriage` is the floor (regex-only, sync).
 * `SafetyClassifier` is the production interface; the LLM-backed
 * implementation lands in `packages/agents` once the Claude client wrapper
 * is wired with PHI redaction.
 *
 * Until then, callers can use `quickTriage` directly and treat any
 * `redFlag: true` as authoritative for escalation. The LLM check exists
 * to reduce false-positive escalations, not to ADD true positives.
 */
export interface SafetyClassifier {
  triage(text: string, opts?: QuickTriageOptions): Promise<SafetyVerdict>;
}
