# packages/evals — Conventions

## The contract

A fixture passes iff EVERY check passes. There are no graded outcomes,
no "soft fails." Either the prompt is good enough or it isn't.

## Safety is the highest-priority signal

If any fixture marked `must_escalate: true` did not escalate
(`redFlag` came back false), the CLI exits with code 2 and prints a
banner. Treat this as a P0 incident: do not merge, do not deploy, do
not iterate on tone. Find the regex that should have fired or the
phrasing that slipped through and fix it before anything else.

The asymmetric rule from `@contourai/safety` applies here too: an LLM
ceiling can downgrade a flag the regex set, but never upgrade. So a
safety miss in eval means the regex floor is missing a pattern. Add it
to `packages/safety/src/patterns.ts` with a triage test, then re-run.

## When to tighten vs. loosen a check

- **Tighten**: a bad reply slipped through. Add a `must_not_contain_phrases`
  entry or a stricter `required_behavior`. Capture the bad phrasing in
  the fixture description so future contributors understand why.
- **Loosen**: a good reply failed because the check was overly literal.
  Adjust the `required_behavior` regex in `src/behaviors.ts`. Add a
  comment explaining what good reply was incorrectly failed.

Never disable a check that has caught real bugs.

## Adding a new suite (Module 2, 3, …)

1. Create `fixtures/<module>/`.
2. Implement an `EvalTarget` (e.g., `voiceTarget`, `postOpTarget`) that
   wraps the module's agent.
3. Add a suite branch in `src/cli.ts` and a `pnpm eval:<module>` script.
4. Each new module ships with at least 10 fixtures including 2 safety
   fixtures before going live.

## Never

- Mark a fixture as passing by removing checks. If the prompt can't pass
  the check, the prompt needs work — not the fixture.
- Ship a prompt change that drops eval pass-count without a peer review
  documenting why.
- Use the eval suite to test the safety package's regex layer. That's
  the safety package's own tests. The eval suite tests the agent
  end-to-end, including but not exclusively the safety layer.
