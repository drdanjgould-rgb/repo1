import type { RedFlagPattern } from './types.js';

/**
 * Built-in red-flag taxonomy. Severity is the BASE; post-op context can
 * bump it +1 in the triage layer (capped at 5).
 *
 * Bias: we err toward over-flagging at the regex level. The LLM ceiling
 * layer (Opus 4.7, lands in packages/agents) disambiguates hypotheticals
 * and quotes. Regex catches the easy 90% at ~0ms.
 */
export const RED_FLAG_PATTERNS: ReadonlyArray<RedFlagPattern> = [
  // ─── Cardiac / respiratory ───────────────────────────────────────────
  {
    id: 'chest_pain',
    re: /\bchest\s+pain\b/i,
    category: 'medical_emergency',
    severity: 5,
  },
  {
    id: 'cant_breathe',
    re: /\b(?:can(?:'|’)?t|cannot)\s+breathe\b/i,
    category: 'medical_emergency',
    severity: 5,
  },
  {
    id: 'shortness_breath',
    re: /\bshortness\s+of\s+breath\b/i,
    category: 'medical_emergency',
    severity: 4,
  },

  // ─── Bleeding ────────────────────────────────────────────────────────
  {
    id: 'bleeding',
    re: /\b(?:bleeding|hemorrhag\w*|gushing)\b/i,
    category: 'post_op_complication',
    severity: 4,
  },

  // ─── Neuro ───────────────────────────────────────────────────────────
  {
    id: 'dizzy_lightheaded',
    re: /\b(?:dizzy|lightheaded)\b/i,
    category: 'medical_emergency',
    severity: 3,
  },
  {
    id: 'fainted',
    re: /\b(?:faint(?:ed|ing)?|passed\s+out)\b/i,
    category: 'medical_emergency',
    severity: 5,
  },
  {
    id: 'numbness',
    re: /\bnumb(?:ness)?\b/i,
    category: 'medical_emergency',
    severity: 3,
  },
  {
    id: 'vision_change',
    re: /\b(?:can(?:'|’)?t\s+see|vision\s+loss|blurred\s+vision|sudden\s+blurry\s+vision)\b/i,
    category: 'medical_emergency',
    severity: 5,
  },
  {
    id: 'slurred_speech',
    re: /\bslurred\s+speech\b/i,
    category: 'medical_emergency',
    severity: 5,
  },

  // ─── Mental health ───────────────────────────────────────────────────
  {
    id: 'suicide',
    re: /\bsuicid(?:e|al)\b/i,
    category: 'mental_health',
    severity: 5,
  },
  {
    id: 'self_harm',
    re: /\b(?:kill\s+myself|harm\s+myself|hurt\s+myself|end\s+(?:it\s+)?all)\b/i,
    category: 'mental_health',
    severity: 5,
  },
  {
    id: 'want_to_die',
    re: /\b(?:want\s+to\s+die|don(?:'|’)?t\s+want\s+to\s+live)\b/i,
    category: 'mental_health',
    severity: 5,
  },

  // ─── Emergency context ───────────────────────────────────────────────
  {
    id: 'nine_one_one',
    re: /\b(?:call|calling|called|dial)\s*911\b|\b911\b/,
    category: 'medical_emergency',
    severity: 4,
  },
  // Tightened to avoid bare "ER" idioms ("the ER was busy"); requires
  // motion-toward-ER, presence-in-ER, or the full "emergency room" phrase.
  {
    id: 'er_visit',
    re: /\b(?:go(?:ing)?\s+to\s+(?:the\s+)?ER|at\s+(?:the\s+)?ER\b|in\s+(?:the\s+)?ER\b|emergency\s+room|ambulance)\b/i,
    category: 'medical_emergency',
    severity: 4,
  },

  // ─── Infection / post-op complication ───────────────────────────────
  // Fever pattern matches "fever" near a 3-digit temp in the 101-109 range.
  // Doesn't fire on "fever" alone (which could be hypothetical).
  {
    id: 'fever_high',
    re: /\bfever\b[^.]{0,30}\b10[1-9](?:\.\d)?\b|\b10[1-9](?:\.\d)?\b[^.]{0,30}\bfever\b/i,
    category: 'medical_emergency',
    severity: 4,
  },
  {
    id: 'pus_discharge',
    re: /\b(?:pus|purulent)\b/i,
    category: 'post_op_complication',
    severity: 4,
  },
  {
    id: 'wound_dehiscence',
    re: /\b(?:dehiscence|incision\s+open(?:ed|ing)?|open\s+wound|wound\s+open(?:ed|ing)?|sutures?\s+(?:came|fell)\s+out)\b/i,
    category: 'post_op_complication',
    severity: 5,
  },
  {
    id: 'infection',
    re: /\binfection\b/i,
    category: 'post_op_complication',
    severity: 3,
  },
  {
    id: 'sepsis',
    re: /\bsepsis\b/i,
    category: 'medical_emergency',
    severity: 5,
  },

  // ─── Allergic / anaphylaxis ─────────────────────────────────────────
  {
    id: 'allergic_reaction',
    re: /\b(?:allergic\s+reaction|anaphylaxis|throat\s+(?:is\s+|are\s+)?(?:swell\w*|clos\w*)|swollen\s+(?:tongue|throat)|hives\s+all\s+over)\b/i,
    category: 'medical_emergency',
    severity: 5,
  },

  // ─── Post-op-specific concerns (only trigger when postOp=true) ──────
  {
    id: 'asymmetric_swelling_postop',
    re: /\b(?:one\s+side\s+(?:swelling|swollen)|asymmetric\s+swelling|sudden\s+swelling)\b/i,
    category: 'post_op_complication',
    severity: 4,
    postOpOnly: true,
  },
  {
    id: 'drain_problem_postop',
    re: /\b(?:drain\s+(?:stopped|clogged|fell\s+out)|jp\s+drain)\b/i,
    category: 'post_op_complication',
    severity: 3,
    postOpOnly: true,
  },
];
