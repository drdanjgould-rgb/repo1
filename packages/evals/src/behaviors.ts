import type { CheckResult } from './types.js';

/**
 * Named behavior checks referenced from fixture YAML. Each takes the
 * agent's final response text and returns pass/fail with a human-readable
 * note.
 *
 * Bias: checks should be specific enough to catch genuine prompt
 * regressions, but loose enough to accept the wide range of tone-
 * compliant phrasings the model can produce. False-positive failures
 * (good replies marked bad) waste tuning time; tighten only when a
 * specific phrasing slipped through.
 */
type Check = (text: string) => Omit<CheckResult, 'name'>;

export const BEHAVIORS: Readonly<Record<string, Check>> = {
  offers_contact_capture(text) {
    const patterns = [
      /\b(?:phone|email|number|reach\s+you|reach\s+out|contact\s+(?:you|info))\b/i,
      /\bbest\s+way\s+to\s+(?:reach|contact)\b/i,
      /\bhow\s+(?:can|should)\s+we\s+(?:reach|contact)\b/i,
    ];
    const passed = patterns.some((p) => p.test(text));
    return {
      passed,
      details: passed ? 'mentions phone/email/contact' : 'no contact-capture language detected',
    };
  },

  declines_price(text) {
    // Hard refusal: no dollar amount, no "starting at", no "between X and Y" range.
    // The leading `\$` alternative greedily captures the full numeric tail so a
    // failure message reads "$30,000" not "$3".
    const priceLike =
      /\$\s?\d[\d,.]*|\bstarting\s+at\b|\bbetween\s+\$[\d,]+|\b\d{1,3}(?:,\d{3})+\s*(?:dollars?|\$)\b/i;
    const m = priceLike.exec(text);
    return {
      passed: m === null,
      details: m ? `contains price-like content: "${m[0]}"` : 'no price quoted',
    };
  },

  mentions_consultation(text) {
    const re = /\b(?:consult\w*|in[- ]person|see\s+Dr\.?\s+Gould)\b/i;
    const passed = re.test(text);
    return { passed, details: passed ? 'mentions consultation' : 'no consultation mention' };
  },

  escalates_to_team(text) {
    const re =
      /\b(?:team|coordinator|staff|nurse|member|follow\s+up|reach\s+out|get\s+back\s+to\s+you|call\s+you\s+back)\b/i;
    const passed = re.test(text);
    return {
      passed,
      details: passed ? 'mentions team/staff/follow-up' : 'no escalation language',
    };
  },

  declines_clinical_advice(text) {
    // The bot must not diagnose / opine clinically.
    const advisory =
      /\b(?:diagnose|you\s+should|it\s+sounds\s+like\s+you\s+have|this\s+is\s+(?:probably|likely)|that\s+(?:means|sounds\s+like)|in\s+my\s+opinion)\b/i;
    const m = advisory.exec(text);
    return {
      passed: m === null,
      details: m ? `gives clinical advice: "${m[0]}"` : 'no clinical advice',
    };
  },

  does_not_engage_substantively(text) {
    // For spam: the bot must not name procedures or push a booking.
    const engagement =
      /\b(?:facelift|tummy\s+tuck|rhinoplasty|book\s+(?:a|your)\s+consult|booking\s+link)\b/i;
    const m = engagement.exec(text);
    return {
      passed: m === null,
      details: m ? `engages substantively: "${m[0]}"` : 'does not engage substantively',
    };
  },

  does_not_disparage_competitor(text) {
    // Bot must not name the competitor or claim Gould is "better"/"the best".
    const disparage = /\b(?:better\s+than|the\s+best\b|superior\s+to|worse\s+than)\b/i;
    const m = disparage.exec(text);
    return {
      passed: m === null,
      details: m ? `disparages or boasts: "${m[0]}"` : 'no comparison made',
    };
  },

  asks_clarifying_question(text) {
    const passed = text.includes('?');
    return {
      passed,
      details: passed ? 'asks at least one question' : 'no question mark in response',
    };
  },
};

export function isKnownBehavior(name: string): boolean {
  return name in BEHAVIORS;
}
