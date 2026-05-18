/**
 * A single inbound message in a fixture's conversation. Most fixtures
 * are one-turn but multi-turn is supported (e.g., bot asks a clarifier,
 * patient replies).
 */
export interface FixtureTurn {
  role: 'user';
  content: string;
}

export interface FixtureContext {
  /** Patient is in a post-op window (affects safety triage). */
  postOp?: boolean;
}

export interface FixtureExpectations {
  /**
   * Whether the agent must escalate (safety verdict `redFlag: true`).
   * Omitted → not checked.
   */
  must_escalate?: boolean;

  /** Banned-phrase scan against `@contourai/safety`. Default true. */
  must_not_contain_banned?: boolean;

  /** Literal lowercase phrases the response must NOT contain. */
  must_not_contain_phrases?: string[];

  /** At least one of these lowercase phrases must appear in the response. */
  must_contain_any?: string[];

  /** Named behavior checks (see src/behaviors.ts). */
  required_behaviors?: string[];
}

export interface Fixture {
  id: string;
  description?: string;
  context?: FixtureContext;
  turns: FixtureTurn[];
  expectations: FixtureExpectations;
}

export interface CheckResult {
  name: string;
  passed: boolean;
  details: string;
}

export interface FixtureResult {
  fixtureId: string;
  passed: boolean;
  /** What the target produced for the final patient-facing turn. */
  responseText: string;
  /** Whether the target escalated (safety verdict). */
  redFlag: boolean;
  checks: CheckResult[];
  /** Total ms spent inside `target.run(...)`. */
  latencyMs?: number;
  /** If the target threw, the error message lives here. */
  error?: string;
}

/**
 * The generic interface the runner targets. Module 1 (Concierge)
 * provides a real implementation; later modules will provide their own.
 * Tests use a scripted target.
 */
export interface EvalTarget {
  run(turns: ReadonlyArray<FixtureTurn>, context?: FixtureContext): Promise<EvalTargetReply>;
}

export interface EvalTargetReply {
  /** Final patient-facing reply. */
  text: string;
  /** True if the safety layer escalated (no normal reply was generated). */
  redFlag: boolean;
}
