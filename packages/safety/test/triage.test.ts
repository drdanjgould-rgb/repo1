import { describe, expect, it } from 'vitest';
import { quickTriage } from '../src/index.js';

describe('quickTriage — positive cases (must escalate)', () => {
  // ─── Cardiac / respiratory ──────────────────────────────────────────
  it('flags chest pain as medical_emergency, severity 5', () => {
    const v = quickTriage("I've been having chest pain for an hour");
    expect(v.redFlag).toBe(true);
    expect(v.category).toBe('medical_emergency');
    expect(v.severity).toBe(5);
    expect(v.patterns).toContain('chest_pain');
  });

  it('flags "can\'t breathe"', () => {
    const v = quickTriage("I can't breathe properly");
    expect(v.redFlag).toBe(true);
    expect(v.category).toBe('medical_emergency');
    expect(v.severity).toBe(5);
  });

  it('flags "shortness of breath"', () => {
    const v = quickTriage('Having shortness of breath since this morning');
    expect(v.redFlag).toBe(true);
    expect(v.severity).toBe(4);
  });

  // ─── Bleeding ───────────────────────────────────────────────────────
  it('flags bleeding as post_op_complication', () => {
    const v = quickTriage('I think I am bleeding through the dressing');
    expect(v.redFlag).toBe(true);
    expect(v.category).toBe('post_op_complication');
    expect(v.patterns).toContain('bleeding');
  });

  it('flags hemorrhage', () => {
    expect(quickTriage('the surgeon mentioned hemorrhage risk').redFlag).toBe(true);
  });

  // ─── Neuro ──────────────────────────────────────────────────────────
  it('flags dizzy + lightheaded', () => {
    const v = quickTriage('I feel dizzy and lightheaded');
    expect(v.redFlag).toBe(true);
    expect(v.category).toBe('medical_emergency');
  });

  it('flags passed out / fainting at severity 5', () => {
    const v = quickTriage('I passed out this morning');
    expect(v.severity).toBe(5);
    expect(v.patterns).toContain('fainted');
  });

  it('flags sudden vision change at severity 5', () => {
    const v = quickTriage('sudden blurry vision in my left eye');
    expect(v.redFlag).toBe(true);
    expect(v.severity).toBe(5);
  });

  it('flags slurred speech', () => {
    expect(quickTriage('my mother has slurred speech').redFlag).toBe(true);
  });

  // ─── Mental health ─────────────────────────────────────────────────
  it('flags suicidal ideation as mental_health, severity 5', () => {
    const v = quickTriage('I feel suicidal lately');
    expect(v.category).toBe('mental_health');
    expect(v.severity).toBe(5);
  });

  it('flags self-harm phrasing', () => {
    expect(quickTriage('I want to kill myself').category).toBe('mental_health');
    expect(quickTriage('I just want to end it all').category).toBe('mental_health');
  });

  // ─── Emergency context ─────────────────────────────────────────────
  it('flags 911 references', () => {
    expect(quickTriage('should I call 911?').redFlag).toBe(true);
  });

  it('flags "going to the emergency room"', () => {
    const v = quickTriage('I am going to the emergency room now');
    expect(v.redFlag).toBe(true);
    expect(v.category).toBe('medical_emergency');
  });

  // ─── Infection / post-op ───────────────────────────────────────────
  it('flags fever 102', () => {
    const v = quickTriage('my fever is 102 right now');
    expect(v.redFlag).toBe(true);
    expect(v.patterns).toContain('fever_high');
  });

  it('flags pus / purulent', () => {
    expect(quickTriage('there is pus coming out').redFlag).toBe(true);
  });

  it('flags wound dehiscence', () => {
    expect(quickTriage('my incision opened up').redFlag).toBe(true);
    expect(quickTriage('the sutures came out').redFlag).toBe(true);
  });

  it('flags sepsis at severity 5', () => {
    expect(quickTriage('they said it could be sepsis').severity).toBe(5);
  });

  // ─── Allergic ──────────────────────────────────────────────────────
  it('flags allergic reaction at severity 5', () => {
    const v = quickTriage('I think I am having an allergic reaction');
    expect(v.severity).toBe(5);
    expect(v.category).toBe('medical_emergency');
  });

  it('flags throat swelling', () => {
    expect(quickTriage('my throat is swelling').redFlag).toBe(true);
  });
});

describe('quickTriage — negative cases (must NOT escalate)', () => {
  it('"How much does this cost?" is not a red flag', () => {
    expect(quickTriage('How much does this cost?').redFlag).toBe(false);
  });

  it('"Can I book a consult?" is not a red flag', () => {
    expect(quickTriage('Can I book a consult?').redFlag).toBe(false);
  });

  it('"Recovery takes 2-3 weeks normally" is not a red flag', () => {
    expect(quickTriage('Recovery normally takes 2-3 weeks').redFlag).toBe(false);
  });

  it('"The ER was busy last night" is the noun, not motion-to-ER', () => {
    expect(quickTriage('The ER was busy last night').redFlag).toBe(false);
  });

  it('"I am excited for my surgery" is positive sentiment, no red flag', () => {
    expect(quickTriage('I am excited for my surgery on Tuesday').redFlag).toBe(false);
  });

  it('"What is the typical recovery time?" is not a red flag', () => {
    expect(quickTriage('What is the typical recovery time?').redFlag).toBe(false);
  });
});

describe('quickTriage — verdict shape', () => {
  it('no match returns category=none, severity=1, empty patterns', () => {
    const v = quickTriage('hello there');
    expect(v).toEqual({
      redFlag: false,
      category: 'none',
      severity: 1,
      rationale: 'no patterns matched',
      patterns: [],
    });
  });

  it('multiple hits aggregate to the highest severity', () => {
    const v = quickTriage('I have chest pain and feel dizzy');
    expect(v.severity).toBe(5);
    expect(v.patterns).toContain('chest_pain');
    expect(v.patterns).toContain('dizzy_lightheaded');
  });

  it('rationale is non-empty on a flag', () => {
    const v = quickTriage('I am bleeding');
    expect(v.rationale.length).toBeGreaterThan(0);
  });
});

describe('quickTriage — postOp option', () => {
  it('bumps severity by +1 when patient is post-op (capped at 5)', () => {
    const v1 = quickTriage('numbness in my fingers');
    const v2 = quickTriage('numbness in my fingers', { postOp: true });
    expect(v2.severity).toBe(Math.min(5, v1.severity + 1));
  });

  it('post-op-only patterns do not fire without postOp=true', () => {
    expect(quickTriage('my drain stopped working').redFlag).toBe(false);
    expect(quickTriage('my drain stopped working', { postOp: true }).redFlag).toBe(true);
  });

  it('flags a new lump only when patient is post-op', () => {
    expect(quickTriage('I have a lump under my chin').redFlag).toBe(false);
    const v = quickTriage('I have a lump under my chin', { postOp: true });
    expect(v.redFlag).toBe(true);
    expect(v.patterns).toContain('new_lump_postop');
  });

  it('cannot bump severity past 5', () => {
    const v = quickTriage('I have chest pain', { postOp: true });
    expect(v.severity).toBe(5);
  });
});

describe('quickTriage — additionalRedFlags option', () => {
  it('accepts clinic-specific patterns via additionalRedFlags', () => {
    const v = quickTriage('my implant is shifting and it hurts', {
      additionalRedFlags: [
        {
          pattern: /\bimplant\s+(?:is\s+)?(?:weird|moving|shifting)\b/,
          category: 'post_op_complication',
          severity: 3,
        },
      ],
    });
    expect(v.redFlag).toBe(true);
    expect(v.patterns).toContain('custom_0');
  });

  it('accepts string patterns (case-insensitive by default)', () => {
    const v = quickTriage('my BOTOX site is hot', {
      additionalRedFlags: [
        {
          pattern: 'botox site is hot',
          category: 'post_op_complication',
          severity: 3,
        },
      ],
    });
    expect(v.redFlag).toBe(true);
  });
});
