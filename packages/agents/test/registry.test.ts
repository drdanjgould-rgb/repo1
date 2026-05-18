import { describe, expect, it } from 'vitest';
import { PromptRegistry } from '../src/prompts/registry.js';
import type { PromptTemplate } from '../src/prompts/types.js';

interface DummyInput {
  name: string;
}

function makePrompt(version: number): PromptTemplate<DummyInput, string> {
  return {
    id: 'concierge.reply',
    version,
    description: `dummy v${version}`,
    build: (input) => ({
      model: 'claude-sonnet-4-6',
      max_tokens: 100,
      messages: [{ role: 'user', content: `hi ${input.name}` }],
    }),
    parseOutput: (response) => {
      const block = response.content[0];
      return block && block.type === 'text' ? block.text : '';
    },
  };
}

describe('PromptRegistry', () => {
  it('registers and retrieves a prompt by id', () => {
    const r = new PromptRegistry();
    r.register(makePrompt(1));
    const got = r.get<DummyInput, string>('concierge.reply');
    expect(got.version).toBe(1);
  });

  it('returns the latest version when no version is pinned', () => {
    const r = new PromptRegistry();
    r.register(makePrompt(1));
    r.register(makePrompt(2));
    r.register(makePrompt(3));
    expect(r.get('concierge.reply').version).toBe(3);
  });

  it('returns a pinned version when requested', () => {
    const r = new PromptRegistry();
    r.register(makePrompt(1));
    r.register(makePrompt(2));
    expect(r.get('concierge.reply', 1).version).toBe(1);
    expect(r.get('concierge.reply', 2).version).toBe(2);
  });

  it('throws on duplicate version registration', () => {
    const r = new PromptRegistry();
    r.register(makePrompt(1));
    expect(() => r.register(makePrompt(1))).toThrow(/already registered/);
  });

  it('throws on unknown prompt id', () => {
    const r = new PromptRegistry();
    expect(() => r.get('nope')).toThrow(/not registered/);
  });

  it('throws on unknown version', () => {
    const r = new PromptRegistry();
    r.register(makePrompt(1));
    expect(() => r.get('concierge.reply', 99)).toThrow(/v99/);
  });

  it('lists all registered prompts and versions', () => {
    const r = new PromptRegistry();
    r.register(makePrompt(1));
    r.register(makePrompt(2));
    const list = r.list();
    expect(list).toHaveLength(2);
    expect(list.map((p) => p.version).sort()).toEqual([1, 2]);
  });
});
