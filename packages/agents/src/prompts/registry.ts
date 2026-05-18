import type { PromptTemplate } from './types.js';

/**
 * Prompt registry. Stores prompt templates by (id, version) so multiple
 * versions can coexist for A/B evals and gradual rollouts.
 *
 * Usage:
 *   const registry = new PromptRegistry();
 *   registry.register(conciergeReplyV1);
 *   registry.register(conciergeReplyV2);
 *   const prompt = registry.get('concierge.reply');          // latest
 *   const prev   = registry.get('concierge.reply', 1);       // pinned
 */
export class PromptRegistry {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the registry is heterogeneous by design; type safety is recovered at get() with a generic
  private readonly byId = new Map<string, Array<PromptTemplate<any, any>>>();

  register<I, O>(prompt: PromptTemplate<I, O>): void {
    const existing = this.byId.get(prompt.id) ?? [];
    if (existing.some((p) => p.version === prompt.version)) {
      throw new Error(`prompt ${prompt.id}@v${prompt.version} is already registered`);
    }
    existing.push(prompt);
    existing.sort((a, b) => b.version - a.version);
    this.byId.set(prompt.id, existing);
  }

  /**
   * Look up a prompt by id. If `version` is omitted, returns the highest
   * version registered. Throws if no matching prompt exists.
   */
  get<I, O>(id: string, version?: number): PromptTemplate<I, O> {
    const versions = this.byId.get(id);
    if (!versions || versions.length === 0) {
      throw new Error(`prompt not registered: ${id}`);
    }
    if (version === undefined) {
      // sorted desc on insert, so [0] is latest
      return versions[0] as PromptTemplate<I, O>;
    }
    const match = versions.find((p) => p.version === version);
    if (!match) {
      throw new Error(`prompt ${id}@v${version} not registered`);
    }
    return match as PromptTemplate<I, O>;
  }

  /** Enumerate every registered prompt + version. */
  list(): Array<{ id: string; version: number; description?: string }> {
    const out: Array<{ id: string; version: number; description?: string }> = [];
    for (const versions of this.byId.values()) {
      for (const p of versions) {
        out.push({
          id: p.id,
          version: p.version,
          ...(p.description !== undefined ? { description: p.description } : {}),
        });
      }
    }
    return out;
  }
}

/**
 * Process-wide default registry. Modules import this and call `register()`
 * at module load. Tests construct their own `PromptRegistry` instances to
 * isolate.
 */
export const defaultRegistry = new PromptRegistry();
