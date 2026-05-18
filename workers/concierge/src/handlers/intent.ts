import type { ClaudeClient, ToolDefinition } from '@contourai/agents';

export type Intent =
  | 'pricing'
  | 'procedure_info'
  | 'booking'
  | 'post_op'
  | 'complaint'
  | 'spam'
  | 'other';

export interface IntentResult {
  intent: Intent;
  /** Free-form procedure name the patient referenced, if any. */
  procedure?: string;
  /** 1–5: how urgent the patient sounds. Drives nurture vs. priority queue. */
  urgency: 1 | 2 | 3 | 4 | 5;
  /** Whether the patient explicitly asked for a human. */
  asked_for_human: boolean;
}

const INTENT_SYSTEM = `You are an intent classifier for an aesthetic-surgery practice's patient-coordinator chatbot.
You will be shown one inbound DM. Classify it into exactly one intent
from the schema and call the \`classify\` tool. Be conservative:

- "pricing" only when the patient explicitly asks about cost / price.
- "procedure_info" for any educational question (anatomy, technique,
  recovery, candidacy).
- "booking" when the patient asks to schedule, book, or consult.
- "post_op" when the patient describes themselves as currently
  recovering from a surgery at this or another practice.
- "complaint" when the patient expresses dissatisfaction with a prior
  result, the staff, or another practice.
- "spam" for promotional / unrelated / link-spam content.
- "other" for anything that doesn't clearly fit (vague openers,
  off-topic chat).

Set \`asked_for_human\` to true only when the patient explicitly asks
to talk to a person ("can I talk to a nurse", "is there a real human
here", etc.). Wanting to book a consult does NOT count.

\`urgency\` is the patient's perceived urgency:
  1 = idle / browsing, 2 = curious, 3 = engaged, 4 = ready to act,
  5 = explicit "I want to book now" / "I'm flying in next week".`;

const INTENT_TOOL: ToolDefinition = {
  name: 'classify',
  description: 'Record the intent classification for this DM.',
  input_schema: {
    type: 'object',
    required: ['intent', 'urgency', 'asked_for_human'],
    properties: {
      intent: {
        type: 'string',
        enum: ['pricing', 'procedure_info', 'booking', 'post_op', 'complaint', 'spam', 'other'],
      },
      procedure: {
        type: 'string',
        description: 'Free-form procedure name if mentioned; empty otherwise.',
      },
      urgency: { type: 'integer', minimum: 1, maximum: 5 },
      asked_for_human: { type: 'boolean' },
    },
  },
};

const VALID_INTENTS: ReadonlySet<Intent> = new Set([
  'pricing',
  'procedure_info',
  'booking',
  'post_op',
  'complaint',
  'spam',
  'other',
]);

/**
 * Classify an inbound DM into one of the seven intents. Uses Haiku 4.5
 * (cheap, sub-half-second) since the output schema is small and the
 * decision is well-defined. Throws if the model returns a malformed
 * tool input — the worker treats that as a degraded-mode signal.
 */
export async function classifyIntent(
  client: ClaudeClient,
  message: string,
  opts: { model?: string } = {},
): Promise<IntentResult> {
  const resp = await client.messages({
    model: opts.model ?? 'claude-haiku-4-5',
    max_tokens: 300,
    system: [{ type: 'text', text: INTENT_SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: message }],
    tools: [INTENT_TOOL],
    tool_choice: { type: 'tool', name: 'classify' },
    metadata: { module: 'workers/concierge/intent' },
  });
  const toolUse = resp.content.find((b) => b.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error('intent classifier did not call the classify tool');
  }
  const input = toolUse.input;
  if (typeof input !== 'object' || input === null) {
    throw new Error('intent classifier returned non-object tool input');
  }
  const o = input as Record<string, unknown>;

  const intent = typeof o['intent'] === 'string' ? (o['intent'] as Intent) : null;
  if (intent === null || !VALID_INTENTS.has(intent)) {
    throw new Error(`intent classifier returned invalid intent: ${String(o['intent'])}`);
  }
  const urgency = clampUrgency(o['urgency']);
  const askedForHuman = o['asked_for_human'] === true;
  const procedure =
    typeof o['procedure'] === 'string' && o['procedure'].length > 0 ? o['procedure'] : undefined;

  return {
    intent,
    urgency,
    asked_for_human: askedForHuman,
    ...(procedure !== undefined ? { procedure } : {}),
  };
}

function clampUrgency(v: unknown): 1 | 2 | 3 | 4 | 5 {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 1;
  const n = Math.round(v);
  if (n <= 1) return 1;
  if (n >= 5) return 5;
  return n as 2 | 3 | 4;
}
