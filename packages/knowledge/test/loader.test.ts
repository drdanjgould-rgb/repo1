import { describe, expect, it } from 'vitest';
import { containsBannedPhrase } from '@contourai/safety';
import { loadAll, loadBySlug } from '../src/index.js';
import type { KnowledgeSlug } from '../src/types.js';

const EXPECTED: readonly KnowledgeSlug[] = [
  'deep_plane_facelift',
  'drainless_tummy_tuck',
  'recovery_general',
  'consultation_process',
  'pricing_policy',
];

describe('knowledge loader', () => {
  it('loads all five required docs', async () => {
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

  it('each doc body is under 600 words (spec ceiling)', async () => {
    const docs = await loadAll();
    for (const doc of docs) {
      const words = doc.content.split(/\s+/).filter(Boolean).length;
      expect(words, `${doc.slug} word count`).toBeLessThan(600);
    }
  });

  it('no doc contains any banned phrase (defense-in-depth)', async () => {
    const docs = await loadAll();
    for (const doc of docs) {
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

  it('loadBySlug throws on a slug whose file is missing', async () => {
    // @ts-expect-error -- intentionally passing an out-of-union slug
    await expect(loadBySlug('does_not_exist')).rejects.toThrow();
  });

  it('every doc currently lists PLACEHOLDER for reviewed_by', async () => {
    // Sentinel test: when Dr. Gould signs off, this test flips. Update
    // it then. The presence of this assertion is the reminder.
    const docs = await loadAll();
    for (const doc of docs) {
      expect(doc.reviewedBy, doc.slug).toBe('PLACEHOLDER');
    }
  });
});
