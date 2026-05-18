# @contourai/agents

Agent primitives: Claude client wrapper with PHI redact/restore, prompt
registry, tool interface, and the LLM ceiling of the safety pipeline.

## Public surface

```ts
import {
  ClaudeClient,
  createAnthropicTransport,
  PromptRegistry,
  defineTool,
  LLMSafetyClassifier,
} from '@contourai/agents';

const transport = createAnthropicTransport({ apiKey: process.env.ANTHROPIC_API_KEY! });
const client = new ClaudeClient({
  transport,
  logger: pinoLogger,
  defaultModule: 'workers/concierge',
});

// Every messages() call redacts on send, restores on response, and logs.
const resp = await client.messages({
  model: 'claude-sonnet-4-6',
  max_tokens: 1024,
  system: [
    { type: 'text', text: conciergeSystemPrompt, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: clinicBlock, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: patientBlock },
  ],
  messages: [{ role: 'user', content: patientDm }],
  tools: [sendReplyTool],
  tool_choice: { type: 'tool', name: 'send_reply' },
  metadata: { clinicId, conversationId, module: 'workers/concierge' },
});
```

## Components

### `ClaudeClient`

The single seam between agent code and the LLM. On every call:

1. Redacts PHI from every user message and from `system` blocks. Uses
   `@contourai/phi-redact` with a shared `existingMap` so the same name
   across messages tokenizes to the same `<<PHI_NAME_001>>`.
2. Sends to the injected `LLMTransport`.
3. Restores tokens in every `text` block of the response.
4. Logs the call (model, latency, tokens, redaction map, stop reason).

Tool-use blocks in the response are **not** restored — they're structured
JSON, not patient-facing prose. If a future tool needs restored values
inside its input, the caller restores at the call site explicitly.

### `AnthropicTransport`

Production transport wrapping `@anthropic-ai/sdk`. Tests don't use it —
they inject a fake `LLMTransport` (see `test/fake-transport.ts`).

### `PromptRegistry`

Versioned prompt store. Multiple versions of the same prompt id can
coexist for A/B evals. `get(id)` returns the latest; `get(id, n)` pins.
A process-wide `defaultRegistry` is exported; tests use isolated instances.

```ts
const prompt: PromptTemplate<ConciergeInput, ConciergeReply> = {
  id: 'concierge.reply',
  version: 1,
  build: (input) => ({ model: 'claude-sonnet-4-6', max_tokens: 1024, /* ... */ }),
  parseOutput: (resp) => /* extract from resp.content */,
};
defaultRegistry.register(prompt);
```

### `defineTool` + `ToolDefinition`

Type-safe tool definitions paired with executors.

```ts
const sendReplyTool = defineTool<SendReplyInput, void>(
  {
    name: 'send_reply',
    description: 'Send a reply to the patient and record classifier output.',
    input_schema: {
      /* JSON Schema */
    },
  },
  async (input) => {
    /* execute */
  },
);
```

### `LLMSafetyClassifier`

Implements the `SafetyClassifier` contract from `@contourai/safety`. Two
tier behavior:

- If `quickTriage` returns `redFlag: false`, returns immediately (no LLM
  call — saves cost on clear-path messages).
- If `quickTriage` flags, calls Claude Opus 4.7 with a structured `triage`
  tool. The LLM may DOWNGRADE the flag (hypothetical, quote,
  informational) but cannot UPGRADE — only the deterministic regex floor
  introduces escalations.
- On LLM error or malformed tool input, defaults to **upholding** the
  floor verdict (fail-safe).

## What's a shell, what's wired

| Component           | Status                                                                                  |
| ------------------- | --------------------------------------------------------------------------------------- |
| ClaudeClient        | Wired end-to-end (redact, restore, log)                                                 |
| AnthropicTransport  | Wired (production)                                                                      |
| PromptRegistry      | Wired                                                                                   |
| Tools               | Type contract only — no prompts use tools yet                                           |
| LLMSafetyClassifier | Wired against the contract; no real LLM calls in tests                                  |
| DB logger sink      | **Not yet wired** — the `messages` table write lands when the Concierge worker is built |

The `AgentLogger` interface is what the wrapper logs through. The Pino +
DB writer that satisfies it lands with `workers/concierge`.

## Tests

`pnpm --filter @contourai/agents test`

- 8 client tests — redact on send, restore on response, multi-message
  token consistency, logging
- 7 registry tests — versioning, latest-vs-pinned, duplicates, list
- 5 LLM-classifier tests — uphold, downgrade, fail-safe on error,
  fail-safe on malformed tool input, no LLM call when floor clears

## Conventions

See `CLAUDE.md` in this package for the must/never rules.
