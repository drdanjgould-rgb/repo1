/**
 * Canonical message + response types. Modeled on Anthropic's wire format so
 * the production transport is a near-direct pass-through, but expressed as
 * our own interfaces so we can swap providers (OpenAI fallback) without
 * touching every call site.
 */

import type { RedactionMap } from '@contourai/phi-redact';

export type MessageRole = 'user' | 'assistant';

/** A content block inside a message. Mirrors Anthropic's content blocks. */
export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | {
      type: 'tool_result';
      tool_use_id: string;
      content: string;
      is_error?: boolean;
    };

export interface Message {
  role: MessageRole;
  content: string | ContentBlock[];
}

/** A system block with optional ephemeral prompt-cache marker. */
export interface SystemBlock {
  type: 'text';
  text: string;
  /** Prompt-caching hint. Pass `{ type: 'ephemeral' }` to mark a cache breakpoint. */
  cache_control?: { type: 'ephemeral' };
}

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export type ToolChoice = { type: 'auto' } | { type: 'any' } | { type: 'tool'; name: string };

export interface MessagesRequest {
  model: string;
  max_tokens: number;
  system?: string | SystemBlock[];
  messages: Message[];
  tools?: ToolDefinition[];
  tool_choice?: ToolChoice;
  temperature?: number;
  /**
   * Per-request metadata captured by the logger / messages table. Not
   * forwarded to Anthropic.
   */
  metadata?: {
    clinicId?: string;
    conversationId?: string;
    module?: string;
  };
}

export interface MessagesUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

export interface MessagesResponse {
  id: string;
  model: string;
  role: 'assistant';
  content: ContentBlock[];
  stop_reason:
    | 'end_turn'
    | 'max_tokens'
    | 'stop_sequence'
    | 'tool_use'
    | 'pause_turn'
    | 'refusal'
    | null;
  usage: MessagesUsage;
}

/**
 * The transport contract — what `ClaudeClient` delegates to. The
 * production implementation wraps the Anthropic SDK; tests inject a fake.
 */
export interface LLMTransport {
  messages(req: MessagesRequest): Promise<MessagesResponse>;
}

/**
 * Structured log entry from the client wrapper. Concrete loggers (Pino in
 * prod) implement this interface so the wrapper can be tested without IO.
 */
export interface AgentLogger {
  logCall(entry: LogEntry): void | Promise<void>;
}

export interface LogEntry {
  module: string;
  clinicId?: string;
  conversationId?: string;
  model: string;
  latencyMs: number;
  promptTokens: number;
  completionTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  /**
   * Redaction map used for the inbound side of the call. Recorded so a
   * later operator audit can correlate `<<PHI_NAME_001>>` to the
   * underlying patient identifier.
   */
  redactionMap: RedactionMap;
  /**
   * Whether the response contained PHI-looking patterns after restore
   * (true is fine — it means the model echoed back patient info via
   * the restored token). For monitoring redact-bypass attempts.
   */
  responseHasPhi: boolean;
  stopReason: MessagesResponse['stop_reason'];
}

/**
 * Default no-op logger used when the caller doesn't inject one. Production
 * code should always inject a real logger.
 */
export const NULL_LOGGER: AgentLogger = {
  logCall: () => undefined,
};
