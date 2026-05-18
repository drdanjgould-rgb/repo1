import { describe, expect, it } from 'vitest';
import { assertNoPhi, PhiLeakError } from '../src/index.js';

describe('assertNoPhi', () => {
  it('passes on PHI-free text', () => {
    expect(() => assertNoPhi('How long is recovery?')).not.toThrow();
  });

  it('throws on a leaked email', () => {
    expect(() => assertNoPhi('Contact me at sarah@x.com')).toThrow(PhiLeakError);
  });

  it('throws on a leaked phone number', () => {
    expect(() => assertNoPhi('Call 310-555-1234 anytime')).toThrow(PhiLeakError);
  });

  it('throws on a leaked MRN', () => {
    expect(() => assertNoPhi('Patient MRN: 12345678 needs follow-up')).toThrow(PhiLeakError);
  });

  it('throws on a leaked DOB', () => {
    expect(() => assertNoPhi('DOB: 01/15/1985')).toThrow(PhiLeakError);
  });

  it('does NOT throw on a leaked name (names are not high-confidence)', () => {
    // Name detection is too lossy for an assertion. The redactor catches
    // them on the way out; assertNoPhi is the last line of defense for
    // high-confidence patterns only.
    expect(() => assertNoPhi('Sarah Johnson called.')).not.toThrow();
  });

  it('reports the kind and snippet on throw', () => {
    try {
      assertNoPhi('Email: test@example.com');
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(PhiLeakError);
      const err = e as PhiLeakError;
      expect(err.kind).toBe('EMAIL');
      expect(err.snippet).toBe('test@example.com');
    }
  });
});
