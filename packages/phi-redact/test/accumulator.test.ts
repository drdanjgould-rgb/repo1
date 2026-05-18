import { describe, expect, it } from 'vitest';
import { redact } from '../src/index.js';

describe('redact — cross-call accumulation via existingMap', () => {
  it('reuses tokens for the same original across calls', () => {
    const a = redact('Hi, my name is Sarah Johnson.');
    const b = redact("It's Sarah Johnson again, hello!", { existingMap: a.map });
    // Same NAME token should appear in both
    const sarahToken = Object.entries(a.map).find(([, v]) => v === 'Sarah Johnson')?.[0];
    expect(sarahToken).toBeDefined();
    expect(b.redacted).toContain(sarahToken!);
    // The map from b includes the entry too
    expect(b.map[sarahToken!]).toBe('Sarah Johnson');
  });

  it('continues counters from the existing map', () => {
    const a = redact('Email me at first@x.com');
    const b = redact('Or email second@y.com', { existingMap: a.map });
    expect(b.map['<<PHI_EMAIL_001>>']).toBe('first@x.com');
    expect(b.map['<<PHI_EMAIL_002>>']).toBe('second@y.com');
    expect(b.redacted).toContain('<<PHI_EMAIL_002>>');
  });

  it('does not double-tokenize an original already in the map', () => {
    const a = redact('first@x.com');
    const b = redact('first@x.com again', { existingMap: a.map });
    expect(Object.keys(b.map)).toHaveLength(1);
    expect(b.redacted).toBe('<<PHI_EMAIL_001>> again');
  });
});
