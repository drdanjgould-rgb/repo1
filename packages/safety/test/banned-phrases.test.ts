import { describe, expect, it } from 'vitest';
import { BANNED_PHRASES, containsBannedPhrase } from '../src/banned-phrases.js';

describe('containsBannedPhrase', () => {
  it('flags every word in the canonical list', () => {
    for (const word of BANNED_PHRASES) {
      const sentence = `This sentence contains the ${word} word.`;
      const hit = containsBannedPhrase(sentence);
      expect(hit, `should flag "${word}"`).not.toBeNull();
      expect(hit?.phrase).toBe(word.toLowerCase());
    }
  });

  it('is case-insensitive', () => {
    expect(containsBannedPhrase('A TRANSFORMATION awaits')).not.toBeNull();
    expect(containsBannedPhrase('a Journey of healing')).not.toBeNull();
  });

  it('flags "anti-aging" with and without hyphen', () => {
    expect(containsBannedPhrase('our anti-aging products')).not.toBeNull();
    expect(containsBannedPhrase('our antiaging products')).not.toBeNull();
  });

  it('flags all rejuvenate inflections', () => {
    expect(containsBannedPhrase('to rejuvenate')).not.toBeNull();
    expect(containsBannedPhrase('feel rejuvenated')).not.toBeNull();
    expect(containsBannedPhrase('rejuvenates the skin')).not.toBeNull();
    expect(containsBannedPhrase('rejuvenation procedure')).not.toBeNull();
  });

  it('returns null on clean text', () => {
    expect(containsBannedPhrase('Recovery takes 2-3 weeks')).toBeNull();
    expect(containsBannedPhrase('Pricing depends on the specifics')).toBeNull();
    expect(containsBannedPhrase('Consultation with Dr. Gould')).toBeNull();
  });

  it('reports the offset of the match', () => {
    const hit = containsBannedPhrase('hello transformation goodbye');
    expect(hit?.index).toBe(6);
  });
});
