import Anthropic from '@anthropic-ai/sdk';
import type { ContentBlock, LLMTransport, MessagesRequest, MessagesResponse } from './types.js';

/**
 * Production transport: wraps the Anthropic SDK. Tests don't use this —
 * they inject a fake `LLMTransport` directly into `ClaudeClient`.
 */
export class AnthropicTransport implements LLMTransport {
  private readonly client: Anthropic;

  constructor(opts: { apiKey: string; baseURL?: string }) {
    this.client = new Anthropic({
      apiKey: opts.apiKey,
      ...(opts.baseURL !== undefined ? { baseURL: opts.baseURL } : {}),
    });
  }

  async messages(req: MessagesRequest): Promise<MessagesResponse> {
    // The SDK's types overlap heavily with ours; we narrow at the call
    // boundary rather than re-type the entire SDK surface.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SDK request type is parameterized over features we don't expose
    const raw = await this.client.messages.create(req as any);
    return {
      id: raw.id,
      model: raw.model,
      role: 'assistant',
      content: raw.content.map(toContentBlock),
      stop_reason: raw.stop_reason,
      usage: {
        input_tokens: raw.usage.input_tokens,
        output_tokens: raw.usage.output_tokens,
        ...(raw.usage.cache_creation_input_tokens != null
          ? { cache_creation_input_tokens: raw.usage.cache_creation_input_tokens }
          : {}),
        ...(raw.usage.cache_read_input_tokens != null
          ? { cache_read_input_tokens: raw.usage.cache_read_input_tokens }
          : {}),
      },
    };
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- SDK's content block union is large; narrowing inline
function toContentBlock(b: any): ContentBlock {
  if (b.type === 'text') return { type: 'text', text: b.text };
  if (b.type === 'tool_use') return { type: 'tool_use', id: b.id, name: b.name, input: b.input };
  // Server-side tool blocks (e.g., server_tool_use) we don't yet model
  // surface as text for visibility — should never reach a Concierge reply.
  return { type: 'text', text: `[unhandled block type: ${String(b.type)}]` };
}

export function createAnthropicTransport(opts: { apiKey: string; baseURL?: string }): LLMTransport {
  return new AnthropicTransport(opts);
}
