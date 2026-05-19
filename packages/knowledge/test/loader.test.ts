import { describe, expect, it } from 'vitest';
import { containsBannedPhrase } from '@contourai/safety';
import { loadAll, loadBySlug } from '../src/index.js';
import type { KnowledgeSlug } from '../src/types.js';

const EXPECTED: readonly KnowledgeSlug[] = [
  'deep_plane_facelift',
  'drainless_tummy_tuck',
  'breast_augmentation',
  'revision_facelift',
  'recovery_general',
  'consultation_process',
  'pricing_policy',
  '_voice_and_doctrine',
];

/**
 * Procedure / policy docs are capped at 1500 words for readability.
 * Doctrine docs (slug prefix `_`) are exempt — they hold the long-form
 * institutional intelligence and depth is the point.
 */
const PROCEDURE_WORD_CEILING = 1500;

describe('knowledge loader', () => {
  it('loads all required docs', async () => {
    const docs = await loadAll();
    const slugs = docs.map((d) => d.slug).sort();
    expect(slugs).toEqual([...EXPECTED].sort());
  });

  it('each doc has required frontmatter fields', async () => {
    const docs = await loadAll();
    for (const doc of docs) {
      expect(doc.slug, doc.slug).toBeTruthy();
      expect(doc.title, doc.slug).toBeTruthy();
      expect(doc.lastReviewed, doc.slug).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(doc.reviewedBy, doc.slug).toBeTruthy();
      expect(doc.content.length, doc.slug).toBeGreaterThan(50);
    }
  });

  it('procedure / policy docs are under the word ceiling; doctrine docs are exempt', async () => {
    const docs = await loadAll();
    for (const doc of docs) {
      const words = doc.content.split(/\s+/).filter(Boolean).length;
      if (doc.slug.startsWith('_')) {
        // Doctrine docs may be long. Just assert non-empty.
        expect(words, `${doc.slug} should have substantive content`).toBeGreaterThan(100);
      } else {
        expect(words, `${doc.slug} word count`).toBeLessThan(PROCEDURE_WORD_CEILING);
      }
    }
  });

  it('no doc contains any banned phrase (defense-in-depth)', async () => {
    const docs = await loadAll();
    for (const doc of docs) {
      // The doctrine doc enumerates banned phrases by name in the "Never"
      // section. The scan would flag those references, which is the
      // opposite of what we want. Skip the doctrine doc; the banned
      // phrases appear there only as a list of forbidden strings.
      if (doc.slug.startsWith('_')) continue;
      const hit = containsBannedPhrase(doc.content);
      expect(
        hit,
        `${doc.slug} contains banned phrase "${hit?.phrase}" at offset ${hit?.index}`,
      ).toBeNull();
    }
  });

  it('pricing_policy.md includes the no-prices-over-DM rule', async () => {
    const doc = await loadBySlug('pricing_policy');
    expect(doc.content.toLowerCase()).toContain('never quotes prices');
  });

  it('pricing_policy.md includes at least one approved decline phrase', async () => {
    const doc = await loadBySlug('pricing_policy');
    expect(doc.content.toLowerCase()).toContain('pricing depends on the specifics of each patient');
  });

  it('recovery_general.md includes the when-to-contact list', async () => {
    const doc = await loadBySlug('recovery_general');
    const lc = doc.content.toLowerCase();
    expect(lc).toContain('911');
    expect(lc).toContain('fever above 101');
    expect(lc).toContain('bleeding');
  });

  it('deep_plane_facelift.md mentions the SMAS-level / deep-plane distinction', async () => {
    const doc = await loadBySlug('deep_plane_facelift');
    const lc = doc.content.toLowerCase();
    expect(lc).toContain('smas');
    expect(lc).toContain('deep plane');
    expect(lc).toContain('ligament');
  });

  it('breast_augmentation.md covers BII and prepectoral placement', async () => {
    const doc = await loadBySlug('breast_augmentation');
    const lc = doc.content.toLowerCase();
    expect(lc).toContain('breast implant illness');
    expect(lc).toContain('prepectoral');
    expect(lc).toContain('one-third');
  });

  it('revision_facelift.md covers the twelve-month rule', async () => {
    const doc = await loadBySlug('revision_facelift');
    const lc = doc.content.toLowerCase();
    expect(lc).toContain('twelve month');
    expect(lc).toMatch(/not.*reflection of what is\s+possible/s);
  });

  it('_voice_and_doctrine.md captures the philosophical anchors', async () => {
    const doc = await loadBySlug('_voice_and_doctrine');
    expect(doc.content).toContain('Skin does not hold the lift. Structure does.');
    expect(doc.content).toContain('Architecture precedes aesthetics.');
    expect(doc.content).toContain('Tension predicts failure.');
  });

  it('loadBySlug throws on a slug whose file is missing', async () => {
    // @ts-expect-error -- intentionally passing an out-of-union slug
    await expect(loadBySlug('does_not_exist')).rejects.toThrow();
  });

  it('reviewed_by states are recognized (PLACEHOLDER / DJG-source / DJG)', async () => {
    // Sentinel: docs are either still PLACEHOLDER (un-sourced) or
    // DJG-source (extracted from his uploads, awaiting final markdown
    // sign-off) or DJG (fully reviewed). When all docs reach DJG, the
    // worker is approved for autonomous deploy.
    const VALID = new Set(['PLACEHOLDER', 'DJG-source', 'DJG']);
    const docs = await loadAll();
    for (const doc of docs) {
      expect(VALID.has(doc.reviewedBy), `${doc.slug}: ${doc.reviewedBy}`).toBe(true);
    }
  });

  it('every required doc is currently in DJG-source state (awaiting final sign-off)', async () => {
    // Once Dr. Gould signs off after reading the rendered markdown, flip
    // each doc to `DJG` and tighten this assertion accordingly.
    const docs = await loadAll();
    for (const doc of docs) {
      expect(doc.reviewedBy, doc.slug).toBe('DJG-source');
    }
  });
});
