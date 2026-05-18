import { redact, restore, type RedactionMap } from '@contourai/phi-redact';
import type {
  AgentLogger,
  ContentBlock,
  LLMTransport,
  Message,
  MessagesRequest,
  MessagesResponse,
  SystemBlock,
} from './types.js';
import { NULL_LOGGER } from './types.js';
import { containsLikelyPhi } from './phi.js';

export interface ClaudeClientOptions {
  transport: LLMTransport;
  logger?: AgentLogger;
  /**
   * Default module name attached to log entries when a request doesn't
   * supply its own.
   */
  defaultModule?: string;
}

/**
 * The single seam between agent code and the LLM. Responsibilities:
 *
 *   1. Redact PHI from every USER message before send.
 *   2. Redact PHI from system blocks (they shouldn't carry PHI; we still
 *      sweep defensively and surface a warning if found).
 *   3. Send to the injected transport.
 *   4. Restore PHI tokens in every TEXT block of the response (so the
 *      caller gets back natural language with real names / emails).
 *   5. Log the call: model, latency, tokens, redaction map, stop reason.
 *
 * Tool-use blocks in the response are not restored — tool inputs are
 * structured JSON the agent code interprets, not patient-facing prose.
 * If a future tool input contains a restored value, that's the caller's
 * concern to handle explicitly.
 *
 * Tests inject a fake transport so no real API calls happen.
 */
export class ClaudeClient {
  private readonly transport: LLMTransport;
  private readonly logger: AgentLogger;
  private readonly defaultModule: string;

  constructor(opts: ClaudeClientOptions) {
    this.transport = opts.transport;
    this.logger = opts.logger ?? NULL_LOGGER;
    this.defaultModule = opts.defaultModule ?? 'agents';
  }

  async messages(req: MessagesRequest): Promise<MessagesResponse> {
    const accumulator: RedactionMap = {};
    const redactedMessages = req.messages.map((m) => redactMessage(m, accumulator));
    const redactedSystem = redactSystem(req.system, accumulator);

    const sendReq: MessagesRequest = {
      ...req,
      system: redactedSystem,
      messages: redactedMessages,
    };

    const started = Date.now();
    const resp = await this.transport.messages(sendReq);
    const latencyMs = Date.now() - started;

    const restored = restoreResponse(resp, accumulator);

    await this.logger.logCall({
      module: req.metadata?.module ?? this.defaultModule,
      clinicId: req.metadata?.clinicId,
      conversationId: req.metadata?.conversationId,
      model: resp.model,
      latencyMs,
      promptTokens: resp.usage.input_tokens,
      completionTokens: resp.usage.output_tokens,
      cacheReadTokens: resp.usage.cache_read_input_tokens ?? 0,
      cacheCreationTokens: resp.usage.cache_creation_input_tokens ?? 0,
      redactionMap: accumulator,
      responseHasPhi: restored.content
        .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
        .some((b) => containsLikelyPhi(b.text)),
      stopReason: resp.stop_reason,
    });

    return restored;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function redactMessage(m: Message, accumulator: RedactionMap): Message {
  const redactString = (s: string): string => {
    const { redacted, map } = redact(s, { existingMap: accumulator });
    Object.assign(accumulator, map);
    return redacted;
  };

  if (typeof m.content === 'string') {
    return { role: m.role, content: redactString(m.content) };
  }
  const blocks: ContentBlock[] = m.content.map((b) => {
    if (b.type === 'text') return { type: 'text', text: redactString(b.text) };
    if (b.type === 'tool_result') {
      return {
        type: 'tool_result',
        tool_use_id: b.tool_use_id,
        content: redactString(b.content),
        ...(b.is_error !== undefined ? { is_error: b.is_error } : {}),
      };
    }
    // tool_use blocks: input is structured. Pass through. If a caller
    // needs PHI redacted inside tool_use input, they redact at the call
    // site since we can't generically know which fields are PHI.
    return b;
  });
  return { role: m.role, content: blocks };
}

function redactSystem(
  sys: MessagesRequest['system'],
  accumulator: RedactionMap,
): MessagesRequest['system'] {
  if (sys === undefined) return undefined;
  const redactString = (s: string): string => {
    const { redacted, map } = redact(s, { existingMap: accumulator });
    Object.assign(accumulator, map);
    return redacted;
  };

  if (typeof sys === 'string') return redactString(sys);
  return sys.map<SystemBlock>((block) => ({
    type: 'text',
    text: redactString(block.text),
    ...(block.cache_control ? { cache_control: block.cache_control } : {}),
  }));
}

function restoreResponse(resp: MessagesResponse, map: RedactionMap): MessagesResponse {
  if (Object.keys(map).length === 0) return resp;
  const content: ContentBlock[] = resp.content.map((b) => {
    if (b.type === 'text') return { type: 'text', text: restore(b.text, map) };
    return b;
  });
  return { ...resp, content };
}
