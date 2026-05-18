import { containsBannedPhrase, type BannedPhraseHit } from '@contourai/safety';

export type BannedPhraseFilterResult =
  | { ok: true; text: string }
  | { ok: false; hit: BannedPhraseHit };

/**
 * Third layer of banned-phrase enforcement (after the system prompt and
 * the eval banned-phrase scan). The Concierge worker calls this on every
 * outbound text BEFORE sending to Meta / Twilio / etc.
 *
 * Returns `ok: true` if clean; `ok: false` with the matched phrase if
 * the response contained a banned word. The worker then:
 *
 *   - In dev / staging: surface the failure loud (don't send).
 *   - In production with `holding_reply_on_violation` enabled: send a
 *     generic holding reply and queue staff review.
 *
 * Decision policy lives at the call site so we don't bake it into the
 * filter.
 */
export function checkOutbound(text: string): BannedPhraseFilterResult {
  const hit = containsBannedPhrase(text);
  if (hit === null) return { ok: true, text };
  return { ok: false, hit };
}
