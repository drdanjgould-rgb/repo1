# @contourai/worker-concierge

The AI Concierge module. Module 1 of ContourAI.

## Status

**CLI simulator only** in this step. The worker is wired through
`@contourai/agents` (ClaudeClient + PHI redact/restore + safety triage)
but no DB persistence, no Meta webhook, no GHL sync, no Mailchimp trigger
yet. Those land in subsequent steps once the knowledge block + eval
suite are in place.

## CLI simulator — local prompt iteration

```bash
# 1. Get an Anthropic API key.
echo "ANTHROPIC_API_KEY=sk-ant-..." > workers/concierge/.env.local

# 2. Run the simulator.
pnpm dev:concierge
```

You'll see:

```
ContourAI Concierge — local simulator
  Commands: /quit  /clear  /history
  Anything else is treated as a patient DM.

You> hi, how much is a deep plane facelift?

  [claude-sonnet-4-6 1834ms in=512 out=84 stop=end_turn]

Concierge> Hi there! Pricing depends on the specifics of each patient — what
the procedure entails for you specifically. The best path is a consultation
where Dr. Gould can examine you and discuss options. What's the best way to
reach you, phone or email?
```

The line in brackets is a structured log entry written to STDERR
(model, latency, in/out tokens, cache hits, stop reason). The reply
itself is on STDOUT.

## What the simulator does

```
       ┌──────────────────────────────────────────────────────────┐
       │                       cli.ts                             │
       │                                                          │
       │   stdin → quickTriage (regex) ──▶ red flag? ─yes─▶ holding reply
       │                       │ no                              │
       │                       ▼                                 │
       │           ClaudeClient.messages()                       │
       │            (redacts PHI, sends to Anthropic,            │
       │             restores tokens, logs to stderr)            │
       │                       │                                 │
       │                       ▼                                 │
       │                 Concierge> ...                          │
       └──────────────────────────────────────────────────────────┘
```

Conversation history is kept in memory; `/clear` resets it; `/history`
dumps it as JSON; `/quit` exits.

## Editing the prompt

The system prompt lives in `src/prompt.ts`. Edit and re-run (or use
`pnpm dev` which restarts on save via tsx watch).

The current prompt is a **placeholder** — voice rules, banned phrases,
no-prices / no-clinical-claims hard rules. The full Gould-tuned
production prompt with knowledge-base grounding lands once
`packages/knowledge` is populated (step 7) and the eval suite from
`packages/evals` is green (step 8).

## Safety

Every inbound message runs through `@contourai/safety/quickTriage`
before any LLM call. A red flag short-circuits the LLM and prints a
warning to stderr alongside the holding reply. The CLI doesn't write
an escalation row — that's wired when DB-backed conversation persistence
lands.

## Tests

`pnpm --filter @contourai/worker-concierge test` — 5 smoke tests with
`FakeTransport` (no API calls):

- LLM reply text returned, history grows
- Multi-turn history preservation
- Red flag short-circuits (no LLM call, no history mutation)
- `postOp: true` unlocks post-op-specific patterns
- `/clear` empties history
