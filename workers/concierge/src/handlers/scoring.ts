import type { Intent } from './intent.js';

/**
 * Lead scoring weights. Same table as
 * `contourai/docs/patient-journey.md` from the original design pass.
 * Clinic-specific overrides live in `clinics.settings.lead_scoring_weights`
 * (JSONB); the worker passes them in via `opts.weights`.
 */
export interface ScoringWeights {
  asked_to_book: number;
  asked_price: number;
  named_procedure: number;
  provided_phone: number;
  provided_email: number;
  local_zip: number;
  mentioned_timeline: number;
  repeat_engagement: number;
  reacted_to_post: number;
  vague_reply: number;
  comparing_surgeons: number;
}

export const DEFAULT_WEIGHTS: ScoringWeights = {
  asked_to_book: 40,
  asked_price: 20,
  named_procedure: 15,
  provided_phone: 15,
  provided_email: 10,
  local_zip: 10,
  mentioned_timeline: 10,
  repeat_engagement: 10,
  reacted_to_post: 5,
  vague_reply: -10,
  comparing_surgeons: 5,
};

export interface ScoreInput {
  intent: Intent;
  procedure?: string | undefined;
  capturedPhone?: string | undefined;
  capturedEmail?: string | undefined;
  capturedZip?: string | undefined;
  isLocalZip: boolean;
  mentionedTimeline: boolean;
  isRepeatEngagement: boolean;
  comparingSurgeons: boolean;
  isVagueReply: boolean;
  /**
   * LLM's suggested delta. Capped at ±10 so a hallucinated "hot lead!"
   * can't override the deterministic signals.
   */
  llmDelta?: number;
  /** Override individual weights. Missing keys fall back to defaults. */
  weights?: Partial<ScoringWeights>;
}

export interface ScoreResult {
  score: number;
  tier: 'hot' | 'warm' | 'cold' | 'blocked';
  /** Per-weight contributions, for explainability + debugging. */
  contributions: Record<string, number>;
}

export const LLM_DELTA_CAP = 10;

export function scoreLead(input: ScoreInput): ScoreResult {
  const w: ScoringWeights = { ...DEFAULT_WEIGHTS, ...input.weights };
  const c: Record<string, number> = {};

  if (input.intent === 'booking') c['asked_to_book'] = w.asked_to_book;
  if (input.intent === 'pricing') c['asked_price'] = w.asked_price;
  if (input.procedure) c['named_procedure'] = w.named_procedure;
  if (input.capturedPhone) c['provided_phone'] = w.provided_phone;
  if (input.capturedEmail) c['provided_email'] = w.provided_email;
  if (input.capturedZip && input.isLocalZip) c['local_zip'] = w.local_zip;
  if (input.mentionedTimeline) c['mentioned_timeline'] = w.mentioned_timeline;
  if (input.isRepeatEngagement) c['repeat_engagement'] = w.repeat_engagement;
  if (input.comparingSurgeons) c['comparing_surgeons'] = w.comparing_surgeons;
  if (input.isVagueReply) c['vague_reply'] = w.vague_reply;

  if (input.intent === 'complaint' || input.intent === 'spam') {
    c['negative_intent'] = -20;
  }

  if (input.llmDelta !== undefined) {
    const capped = Math.max(-LLM_DELTA_CAP, Math.min(LLM_DELTA_CAP, input.llmDelta));
    if (capped !== 0) c['llm_delta_capped'] = capped;
  }

  const total = Object.values(c).reduce((s, n) => s + n, 0);
  const score = clamp(total, 0, 100);
  const tier = input.intent === 'spam' ? 'blocked' : tierOf(score);

  return { score, tier, contributions: c };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function tierOf(score: number): 'hot' | 'warm' | 'cold' {
  if (score >= 70) return 'hot';
  if (score >= 40) return 'warm';
  return 'cold';
}
