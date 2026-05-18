# packages/agents — Conventions

## Must

- **All LLM calls go through `ClaudeClient`.** No direct `new Anthropic(...)`
  imports outside this package. The wrapper is what enforces PHI
  redaction, restore, and logging — bypassing it bypasses HIPAA posture.
- **Inject the logger.** Production wires Pino + DB write through the
  `AgentLogger` interface. Don't `console.log` from agent code.
- **Pass `metadata.clinicId` and `metadata.conversationId`** on every
  request that has them. Log entries are unindexed without them.
- **Use prompt caching** on stable system + clinic blocks. Mark with
  `cache_control: { type: 'ephemeral' }`. Targeted hit rate > 85%.

## Never

- Build a `MessagesRequest` by string-templating a JSON literal. Use the
  typed shape; the compiler is the spec.
- Put PHI in the prompt cache key. The cache is computed by Anthropic over
  the system + clinic blocks (which should NOT contain patient PHI). The
  patient block is below the cache line and is not cached.
- Restore tokens inside `tool_use` blocks. The agent loop interprets the
  structured input; if it needs the patient's real email, it reads it from
  the redaction map at the call site explicitly.
- Hand-write a "downgrade" in `LLMSafetyClassifier`. The contract is
  asymmetric by design: LLM downgrades only. Any change to that needs a
  founder-cadence review.

## Adding a prompt

1. Write the prompt as a `PromptTemplate<Input, Output>`.
2. Register it in `defaultRegistry` at module load (or inject a clean
   registry in tests).
3. Increment `version` whenever you change semantics. Multiple versions
   may coexist for A/B evals.
4. Add at least one eval fixture before the prompt is used in production.
   The eval gate lands in `packages/evals` (next step).

## Adding a tool

1. Define with `defineTool(definition, execute)`.
2. Provide JSON Schema for `input_schema`. Use `required` for mandatory
   fields. The model will only call your tool with conforming inputs.
3. Validate `input` at the top of `execute` (the JSON-Schema check is
   advisory in practice — we treat it as advisory and re-validate).

## Model defaults

- Generation: `claude-sonnet-4-6` (cheap, fast, plenty of quality).
- Intent classification: `claude-haiku-4-5` (sub-half-second).
- Safety ceiling: `claude-opus-4-7` (highest quality on safety-sensitive
  decisions; false negatives unacceptable).

Override per call site as needed.

## Performance

- Prompt caching is non-optional on stable system + clinic blocks. At
  steady state, expect cache_read_input_tokens to dominate input_tokens.
- The wrapper's redact step is sub-millisecond per message; redact is
  not on the critical-path budget.
- Restore is similarly cheap.
