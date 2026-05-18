import { describe, expect, it } from 'vitest';
import { checkOutbound } from '../src/handlers/banned-filter.js';

describe('checkOutbound', () => {
  it('passes clean text through', () => {
    const r = checkOutbound('Thanks for reaching out — happy to help you find a consult time.');
    expect(r.ok).toBe(true);
    if (r.ok)
      expect(r.text).toBe('Thanks for reaching out — happy to help you find a consult time.');
  });

  it('catches a banned phrase', () => {
    const r = checkOutbound('Begin your transformation journey today!');
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error();
    // The list ordering makes "transformation" the first match.
    expect(['transformation', 'journey']).toContain(r.hit.phrase);
  });

  it('catches case-insensitive variants', () => {
    const r = checkOutbound('Imagine the BEST version OF yourself.');
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error();
    expect(r.hit.phrase.toLowerCase()).toBe('best version of yourself');
  });

  it('catches rejuvenate inflections', () => {
    expect(checkOutbound('rejuvenated skin').ok).toBe(false);
    expect(checkOutbound('rejuvenation procedure').ok).toBe(false);
  });

  it('reports the match offset', () => {
    const r = checkOutbound('Hi! Let us reset your look.');
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error();
    expect(r.hit.index).toBeGreaterThan(0);
  });
});
