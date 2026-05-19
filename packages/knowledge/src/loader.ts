import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { KnowledgeDoc, KnowledgeSlug } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Directory holding the .md knowledge files. Resolved relative to this
 * source file so the layout survives `tsc -b` (dist lives next to src,
 * docs is one directory up from either).
 */
const DOCS_DIR = join(__dirname, '..', 'docs');

const EXPECTED_SLUGS: readonly KnowledgeSlug[] = [
  'deep_plane_facelift',
  'drainless_tummy_tuck',
  'breast_augmentation',
  'revision_facelift',
  'recovery_general',
  'consultation_process',
  'pricing_policy',
  '_voice_and_doctrine',
] as const;

/**
 * Load every knowledge doc from disk. Throws if a required slug is
 * missing or if any doc fails frontmatter validation — we'd rather fail
 * loud at boot than have the LLM ground on partial knowledge.
 */
export async function loadAll(): Promise<KnowledgeDoc[]> {
  const files = await readdir(DOCS_DIR);
  const mdFiles = files.filter((f) => f.endsWith('.md') && f !== 'TODO_FOR_DR_GOULD.md');
  const docs = await Promise.all(mdFiles.map((f) => loadFile(join(DOCS_DIR, f))));
  const bySlug = new Map(docs.map((d) => [d.slug, d]));
  for (const slug of EXPECTED_SLUGS) {
    if (!bySlug.has(slug)) {
      throw new Error(`knowledge: missing required doc "${slug}"`);
    }
  }
  return docs;
}

/** Load a single doc by slug. Throws if not found. */
export async function loadBySlug(slug: KnowledgeSlug): Promise<KnowledgeDoc> {
  const doc = await loadFile(join(DOCS_DIR, `${slug}.md`));
  if (doc.slug !== slug) {
    throw new Error(`knowledge: file ${slug}.md has slug "${doc.slug}"`);
  }
  return doc;
}

async function loadFile(path: string): Promise<KnowledgeDoc> {
  const raw = await readFile(path, 'utf8');
  const { fm, body } = parseFrontmatter(raw);
  const slug = requireString(fm, 'slug', path);
  const title = requireString(fm, 'title', path);
  const lastReviewed = requireString(fm, 'last_reviewed', path);
  const reviewedBy = requireString(fm, 'reviewed_by', path);
  const tags = Array.isArray(fm['tags']) ? fm['tags'].map(String) : [];
  return {
    slug,
    title,
    tags,
    lastReviewed,
    reviewedBy,
    content: body,
  };
}

interface ParsedFrontmatter {
  fm: Record<string, unknown>;
  body: string;
}

/**
 * Minimal YAML-ish frontmatter parser. Supports `key: value` and
 * `key: [a, b, c]`. We don't pull in `js-yaml` to keep the dep footprint
 * lean; the frontmatter spec for our docs is intentionally constrained.
 */
function parseFrontmatter(text: string): ParsedFrontmatter {
  if (!text.startsWith('---\n')) return { fm: {}, body: text };
  const end = text.indexOf('\n---\n', 4);
  if (end === -1) return { fm: {}, body: text };
  const fmText = text.slice(4, end);
  const body = text.slice(end + 5).trimStart();
  const fm: Record<string, unknown> = {};
  for (const line of fmText.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const m = /^([a-z_][a-z0-9_]*):\s*(.+?)\s*$/i.exec(trimmed);
    if (!m) continue;
    const key = m[1];
    const rawVal = m[2];
    if (!key || rawVal === undefined) continue;
    if (rawVal.startsWith('[') && rawVal.endsWith(']')) {
      fm[key] = rawVal
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    } else {
      // Strip optional surrounding quotes
      fm[key] = rawVal.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
    }
  }
  return { fm, body };
}

function requireString(fm: Record<string, unknown>, key: string, path: string): string {
  const v = fm[key];
  if (typeof v !== 'string' || v.length === 0) {
    throw new Error(`knowledge: ${path} is missing required frontmatter "${key}"`);
  }
  return v;
}
