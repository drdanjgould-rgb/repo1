import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import type { Fixture } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const FIXTURES_ROOT = join(__dirname, '..', 'fixtures');

/**
 * Load all fixtures under fixtures/<suite>/. Each .yaml file is one
 * fixture. Throws on missing required fields so a typo in a fixture
 * fails the run rather than silently skipping a check.
 */
export async function loadFixtures(suite: string): Promise<Fixture[]> {
  const dir = join(FIXTURES_ROOT, suite);
  const files = await readdir(dir);
  const fixtures: Fixture[] = [];
  for (const f of files) {
    if (!f.endsWith('.yaml') && !f.endsWith('.yml')) continue;
    const raw = await readFile(join(dir, f), 'utf8');
    const parsed: unknown = parseYaml(raw);
    fixtures.push(validate(parsed, f));
  }
  fixtures.sort((a, b) => a.id.localeCompare(b.id));
  return fixtures;
}

function validate(parsed: unknown, source: string): Fixture {
  if (parsed === null || typeof parsed !== 'object') {
    throw new Error(`${source}: top-level must be an object`);
  }
  const o = parsed as Record<string, unknown>;

  const id = o['id'];
  if (typeof id !== 'string' || !id) throw new Error(`${source}: missing "id"`);

  const turns = o['turns'];
  if (!Array.isArray(turns) || turns.length === 0) {
    throw new Error(`${source}: "turns" must be a non-empty array`);
  }
  const fixtureTurns = turns.map((t, i) => {
    if (typeof t !== 'object' || t === null) {
      throw new Error(`${source}: turn ${i} must be an object`);
    }
    const tr = t as Record<string, unknown>;
    if (tr['role'] !== 'user') {
      throw new Error(`${source}: turn ${i} role must be "user" (got ${String(tr['role'])})`);
    }
    if (typeof tr['content'] !== 'string') {
      throw new Error(`${source}: turn ${i} content must be a string`);
    }
    return { role: 'user' as const, content: tr['content'] };
  });

  const expectations = (o['expectations'] ?? {}) as Record<string, unknown>;
  const fixtureExp = {
    must_escalate:
      typeof expectations['must_escalate'] === 'boolean'
        ? expectations['must_escalate']
        : undefined,
    must_not_contain_banned:
      typeof expectations['must_not_contain_banned'] === 'boolean'
        ? expectations['must_not_contain_banned']
        : true,
    must_not_contain_phrases: asStringArray(expectations['must_not_contain_phrases']),
    must_contain_any: asStringArray(expectations['must_contain_any']),
    required_behaviors: asStringArray(expectations['required_behaviors']),
  };

  const context = (o['context'] ?? {}) as Record<string, unknown>;
  const fixtureContext = {
    postOp: typeof context['postOp'] === 'boolean' ? context['postOp'] : undefined,
  };

  const description = typeof o['description'] === 'string' ? o['description'] : undefined;

  return {
    id,
    ...(description ? { description } : {}),
    context: fixtureContext,
    turns: fixtureTurns,
    expectations: fixtureExp,
  };
}

function asStringArray(v: unknown): string[] | undefined {
  if (v === undefined || v === null) return undefined;
  if (!Array.isArray(v)) throw new Error(`expected an array, got ${typeof v}`);
  return v.map((x) => String(x));
}
