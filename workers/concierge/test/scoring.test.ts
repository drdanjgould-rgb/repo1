import { describe, expect, it } from 'vitest';
import { scoreLead, LLM_DELTA_CAP, DEFAULT_WEIGHTS } from '../src/handlers/scoring.js';

function baseInput() {
  return {
    intent: 'other' as const,
    isLocalZip: false,
    mentionedTimeline: false,
    isRepeatEngagement: false,
    comparingSurgeons: false,
    isVagueReply: false,
  };
}

describe('scoreLead', () => {
  it('returns score 0 / cold for an empty signal set', () => {
    const r = scoreLead(baseInput());
    expect(r.score).toBe(0);
    expect(r.tier).toBe('cold');
  });

  it('booking intent contributes its weight', () => {
    const r = scoreLead({ ...baseInput(), intent: 'booking' });
    expect(r.score).toBe(DEFAULT_WEIGHTS.asked_to_book);
    expect(r.contributions['asked_to_book']).toBe(DEFAULT_WEIGHTS.asked_to_book);
  });

  it('combines hard signals into a hot lead', () => {
    const r = scoreLead({
      ...baseInput(),
      intent: 'booking',
      procedure: 'rhinoplasty',
      capturedPhone: '+15551234567',
      capturedEmail: 'a@b.com',
    });
    // 40 + 15 + 15 + 10 = 80 → hot
    expect(r.score).toBe(80);
    expect(r.tier).toBe('hot');
  });

  it('warm tier at 40, cold below', () => {
    const r1 = scoreLead({ ...baseInput(), intent: 'booking' });
    expect(r1.score).toBe(40);
    expect(r1.tier).toBe('warm');

    const r2 = scoreLead({ ...baseInput(), intent: 'pricing' });
    expect(r2.score).toBe(20);
    expect(r2.tier).toBe('cold');
  });

  it('vague reply subtracts its weight', () => {
    const r = scoreLead({ ...baseInput(), intent: 'pricing', isVagueReply: true });
    // 20 + (-10) = 10
    expect(r.score).toBe(10);
  });

  it('local zip only credits when actually local', () => {
    const r1 = scoreLead({ ...baseInput(), capturedZip: '90210', isLocalZip: false });
    expect(r1.contributions['local_zip']).toBeUndefined();

    const r2 = scoreLead({ ...baseInput(), capturedZip: '90210', isLocalZip: true });
    expect(r2.contributions['local_zip']).toBe(DEFAULT_WEIGHTS.local_zip);
  });

  it('caps positive llmDelta at +10', () => {
    const r = scoreLead({ ...baseInput(), intent: 'booking', llmDelta: 999 });
    expect(r.contributions['llm_delta_capped']).toBe(LLM_DELTA_CAP);
    expect(r.score).toBe(DEFAULT_WEIGHTS.asked_to_book + LLM_DELTA_CAP);
  });

  it('caps negative llmDelta at -10', () => {
    const r = scoreLead({ ...baseInput(), intent: 'booking', llmDelta: -999 });
    expect(r.contributions['llm_delta_capped']).toBe(-LLM_DELTA_CAP);
  });

  it('omits llm_delta_capped when the suggestion is zero', () => {
    const r = scoreLead({ ...baseInput(), llmDelta: 0 });
    expect(r.contributions['llm_delta_capped']).toBeUndefined();
  });

  it('score is clamped to [0, 100]', () => {
    const r = scoreLead({
      ...baseInput(),
      intent: 'booking',
      procedure: 'x',
      capturedPhone: 'p',
      capturedEmail: 'e',
      capturedZip: 'z',
      isLocalZip: true,
      mentionedTimeline: true,
      isRepeatEngagement: true,
      comparingSurgeons: true,
      llmDelta: 999,
    });
    expect(r.score).toBe(100);
    expect(r.tier).toBe('hot');
  });

  it('spam intent forces tier=blocked', () => {
    const r = scoreLead({ ...baseInput(), intent: 'spam' });
    expect(r.tier).toBe('blocked');
  });

  it('complaint subtracts 20 (negative_intent contribution)', () => {
    const r = scoreLead({ ...baseInput(), intent: 'complaint' });
    expect(r.contributions['negative_intent']).toBe(-20);
    expect(r.score).toBe(0); // clamped at 0
  });

  it('respects per-clinic weight overrides', () => {
    const r = scoreLead({
      ...baseInput(),
      intent: 'booking',
      weights: { asked_to_book: 60 },
    });
    expect(r.score).toBe(60);
  });
});
