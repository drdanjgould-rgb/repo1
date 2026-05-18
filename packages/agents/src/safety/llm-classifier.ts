import {
  quickTriage,
  type QuickTriageOptions,
  type SafetyClassifier,
  type SafetyVerdict,
} from '@contourai/safety';
import type { ClaudeClient } from '../client.js';
import type { ToolDefinition } from '../types.js';

const TRIAGE_SYSTEM = `You are a clinical safety classifier for an aesthetic-surgery practice's patient-coordinator chatbot.
You will be shown one patient message at a time alongside an initial regex
verdict. Your job: decide whether the regex verdict should be UPHELD or
DOWNGRADED. You may not introduce a red flag the regex didn't already detect.

Uphold (keep red_flag=true) when the patient describes:
- Current symptoms consistent with the regex match (bleeding now, dizzy now)
- Post-op complications (signs of infection, dehiscence, drain failure,
  asymmetric swelling, sudden vision change after eyelid/facial surgery)
- Active mental-health crisis (current suicidal ideation, self-harm intent)
- A medical emergency in progress (chest pain now, can't breathe now)

Downgrade (set red_flag=false) when the regex matched but the context is:
- A hypothetical question ("what if I bleed?", "is dizziness normal?")
- A quote or reference to someone else's experience ("my friend bled a lot")
- A general informational question with no current symptom
- A discussion of past resolved symptoms ("I bled last week but it stopped")

Be conservative: when in doubt, UPHOLD. Always call the \`triage\` tool.`;

const TRIAGE_TOOL: ToolDefinition = {
  name: 'triage',
  description: 'Record the safety verdict for the patient message.',
  input_schema: {
    type: 'object',
    required: ['red_flag', 'category', 'severity', 'rationale'],
    properties: {
      red_flag: { type: 'boolean' },
      category: {
        type: 'string',
        enum: ['medical_emergency', 'post_op_complication', 'mental_health', 'none'],
      },
      severity: { type: 'integer', minimum: 1, maximum: 5 },
      rationale: {
        type: 'string',
        description: 'One sentence explaining the verdict.',
      },
    },
  },
};

export interface LLMSafetyClassifierOptions {
  client: ClaudeClient;
  /** Model id for the ceiling pass. Default: claude-opus-4-7. */
  model?: string;
  /**
   * If the LLM call fails (timeout, transport error), what should we do?
   *   - 'uphold' (default): keep the regex verdict, log the failure.
   *     Safe default — false negatives are unacceptable.
   *   - 'throw':   propagate the error.
   */
  onLlmError?: 'uphold' | 'throw';
}

/**
 * The ceiling layer of the two-tier safety pipeline. Wraps `quickTriage`
 * (the floor) and, when it flags, runs an LLM check that can DOWNGRADE
 * the flag if the context is hypothetical/quoted/informational. It
 * cannot UPGRADE — only the regex floor introduces escalations.
 *
 * On LLM error, defaults to upholding the floor verdict (fail-safe).
 */
export class LLMSafetyClassifier implements SafetyClassifier {
  private readonly client: ClaudeClient;
  private readonly model: string;
  private readonly onLlmError: 'uphold' | 'throw';

  constructor(opts: LLMSafetyClassifierOptions) {
    this.client = opts.client;
    this.model = opts.model ?? 'claude-opus-4-7';
    this.onLlmError = opts.onLlmError ?? 'uphold';
  }

  async triage(text: string, opts?: QuickTriageOptions): Promise<SafetyVerdict> {
    const floor = quickTriage(text, opts);
    if (!floor.redFlag) return floor;

    let llmInput: unknown;
    try {
      const resp = await this.client.messages({
        model: this.model,
        max_tokens: 400,
        system: [{ type: 'text', text: TRIAGE_SYSTEM, cache_control: { type: 'ephemeral' } }],
        messages: [
          {
            role: 'user',
            content:
              `Patient message:\n${text}\n\n` +
              `Regex initial verdict: red_flag=true, category=${floor.category}, ` +
              `severity=${floor.severity}, matched=[${floor.patterns.join(', ')}]\n\n` +
              `Uphold or downgrade?`,
          },
        ],
        tools: [TRIAGE_TOOL],
        tool_choice: { type: 'tool', name: 'triage' },
        metadata: { module: 'safety/llm-classifier' },
      });
      const toolUse = resp.content.find((b) => b.type === 'tool_use');
      if (!toolUse || toolUse.type !== 'tool_use') {
        throw new Error('LLM did not call triage tool');
      }
      llmInput = toolUse.input;
    } catch (err) {
      if (this.onLlmError === 'throw') throw err;
      return {
        ...floor,
        rationale: `${floor.rationale} (LLM uphold-on-error: ${(err as Error).message})`,
      };
    }

    const parsed = parseTriageInput(llmInput);
    if (!parsed) {
      // Malformed tool input — uphold floor verdict, fail-safe.
      return floor;
    }

    // Apply asymmetric rule: LLM can downgrade but not upgrade.
    if (parsed.red_flag === false) {
      return {
        redFlag: false,
        category: 'none',
        severity: 1,
        rationale: `LLM downgrade: ${parsed.rationale}`,
        patterns: floor.patterns,
      };
    }
    return {
      ...floor,
      rationale: `${floor.rationale}; LLM upheld: ${parsed.rationale}`,
    };
  }
}

interface TriageInput {
  red_flag: boolean;
  category: string;
  severity: number;
  rationale: string;
}

function parseTriageInput(input: unknown): TriageInput | null {
  if (typeof input !== 'object' || input === null) return null;
  const o = input as Record<string, unknown>;
  if (typeof o['red_flag'] !== 'boolean') return null;
  if (typeof o['category'] !== 'string') return null;
  if (typeof o['severity'] !== 'number') return null;
  if (typeof o['rationale'] !== 'string') return null;
  return {
    red_flag: o['red_flag'],
    category: o['category'],
    severity: o['severity'],
    rationale: o['rationale'],
  };
}
