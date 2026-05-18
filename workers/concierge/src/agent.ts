import type { ClaudeClient, Message, MessagesUsage } from '@contourai/agents';
import { quickTriage, type SafetyVerdict } from '@contourai/safety';
import { CONCIERGE_SYSTEM_PROMPT } from './prompt.js';

export interface ConciergeAgent {
  /** Send one inbound message; returns the bot's reply plus diagnostics. */
  reply(message: string): Promise<ReplyResult>;
  /** Snapshot of the current in-memory conversation. */
  history(): readonly Message[];
  /** Discard the conversation. Used by /clear in the CLI. */
  clear(): void;
}

export interface ReplyResult {
  /** Patient-facing text (or the holding reply on red-flag). */
  text: string;
  /** Safety verdict. `redFlag: true` means we short-circuited the LLM. */
  verdict: SafetyVerdict;
  /**
   * Token usage from the LLM call. Absent when we short-circuited on a
   * red flag (no LLM call happened).
   */
  usage?: MessagesUsage;
  /** Latency of the LLM call in ms. Absent on short-circuit. */
  latencyMs?: number;
}

export const HOLDING_REPLY =
  'Thanks for reaching out — a member of our team will respond shortly. ' +
  'If this is a medical emergency, please call 911 or go to the nearest emergency room.';

export interface ConciergeAgentOptions {
  client: ClaudeClient;
  /** Model id. Default: claude-sonnet-4-6. */
  model?: string;
  /** System prompt override. Default: the placeholder in `./prompt.ts`. */
  systemPrompt?: string;
  /** Whether the patient is in a post-op window. Affects safety triage. */
  postOp?: boolean;
}

/**
 * Minimal in-memory Concierge agent for the CLI simulator. Real
 * production use cases (DB-backed conversation history, multi-tenant
 * clinic blocks, GHL sync, Mailchimp triggers) land in subsequent steps.
 *
 * This implementation is deliberately stateless across instances: each
 * `createConciergeAgent` call gets its own history. The CLI creates one
 * agent per session; the production worker will create one per
 * conversation.
 */
export function createConciergeAgent(opts: ConciergeAgentOptions): ConciergeAgent {
  const history: Message[] = [];
  const model = opts.model ?? 'claude-sonnet-4-6';
  const systemPrompt = opts.systemPrompt ?? CONCIERGE_SYSTEM_PROMPT;

  return {
    history: () => history,
    clear: () => {
      history.length = 0;
    },

    async reply(message: string): Promise<ReplyResult> {
      const verdict = quickTriage(message, { postOp: opts.postOp ?? false });

      if (verdict.redFlag) {
        // Short-circuit: do NOT call the LLM, do NOT add to history.
        // The agent loop in production will also write an escalation row
        // and alert clinic staff — out of scope for the CLI simulator.
        return { text: HOLDING_REPLY, verdict };
      }

      history.push({ role: 'user', content: message });

      const started = Date.now();
      const resp = await opts.client.messages({
        model,
        max_tokens: 1024,
        system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
        messages: history,
        metadata: { module: 'workers/concierge' },
      });
      const latencyMs = Date.now() - started;

      const text = resp.content
        .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
        .map((b) => b.text)
        .join('\n');

      history.push({ role: 'assistant', content: text });

      return { text, verdict, usage: resp.usage, latencyMs };
    },
  };
}
