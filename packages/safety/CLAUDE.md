# packages/safety — Conventions

## The escalation contract

A `redFlag: true` verdict means: **stop normal agent processing, send a
holding reply, write an escalation row, alert clinic staff.** Every module
must honor this — no module is allowed to "override" or "ignore" a red flag.

The only way to downgrade a red-flag is the LLM ceiling layer in
`packages/agents`, which can flip `redFlag: true → false` if the message
is a hypothetical or quote. It cannot do the opposite — only the
deterministic regex layer can introduce a red flag.

## Adding a pattern

1. Edit `src/patterns.ts`. Add to `RED_FLAG_PATTERNS`.
2. Pick the right `category` and `severity`. Default-safe is severity 3.
3. If post-op-specific, set `postOpOnly: true`.
4. Add ≥2 tests: one positive, one negative (proves it doesn't fire on
   common false positives).
5. If the pattern adds a brand-new clinical category, also update the
   `SafetyVerdict.category` union in `src/types.ts` and the README.

## When to use regex vs. clinic-config

- **Universal medical red flag** (any clinic, any module): hard-code in
  `RED_FLAG_PATTERNS`.
- **Clinic-specific concern** (e.g., this surgeon uses a specific
  implant brand): use `additionalRedFlags` at the call site, configured
  from `clinics.settings.safety_extensions` in the DB.

## Performance

`quickTriage` is a hot path — runs on every inbound message before the
LLM call. Stay sub-millisecond. Patterns are simple regex; don't add
patterns that backtrack catastrophically. If a pattern needs context
that's expensive to compute, push it to the LLM ceiling instead.

## Never

- Run this package on PHI-stripped (redacted) text. Symptoms get masked.
  Safety triage operates on the original message; PHI redaction happens
  later, before the LLM call.
- Treat `none` as authoritative for "safe." `none` means "no regex match,"
  not "the LLM cleared it." The LLM ceiling is the authoritative pass.
- Skip the safety check on outbound messages. We only triage INBOUND.
  Outbound generation has its own guardrails (banned-phrase filter,
  knowledge-base grounding).
