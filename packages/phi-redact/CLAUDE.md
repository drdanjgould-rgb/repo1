# packages/phi-redact — Conventions

## When this layer must run

- Before any external LLM call (no exception until BAA is executed).
- Before any log call that includes patient message content.
- Before any analytics event that includes message content.
- Before mirroring leads/messages to Google Sheets or any third-party system.

The Claude client wrapper in `packages/agents/` does this automatically;
direct LLM calls bypass the protection, so don't make them. Every external
HTTP client in `packages/integrations/` should `assertNoPhi(body)` before
send when it's a non-BAA endpoint.

## Performance budget

`redact()` must stay sub-millisecond on a typical DM (~200 chars). Don't
add an LLM-based pass here — that defeats the purpose. Hire the LLM at a
higher layer.

## Threat model

- **Operator forgets to redact.** Mitigation: `assertNoPhi()` as
  defensive last-line check; ESLint rule (to be added) to flag
  `console.log` of any variable containing the substring `message` or
  `content`.
- **Patient sends weird unicode / homoglyphs.** Out of scope for v1; we
  normalize to NFKC only if a real attack surface emerges.
- **Adversarial inputs designed to bypass.** Document each bypass in
  `test/adversarial.test.ts` and add a regex to close the gap. Each
  red-team finding gets a test the same day.

## Adding a new PHI kind

1. Add a `PhiKind` literal in `src/types.ts`.
2. Add a pattern file under `src/patterns/<kind>.ts` exporting
   `redact<Kind>` and `detect<Kind>`.
3. Wire it into `redact.ts` in the correct order (most-specific first).
4. Wire `detect<Kind>` into `assert.ts` if it's high-confidence enough to
   warrant a leak-assertion.
5. Add tests in `test/redact.test.ts` (≥3 positive cases, ≥1 false-positive
   guard).
6. Update this file's "Performance budget" if the new pattern is expensive.

## Tokens

Format: `<<PHI_<KIND>_<NNN>>>`. Tokens are stable within one `redact()` call
and arbitrary across calls. NEVER reuse a map across patients — a token
from patient A's map will restore patient A's name if applied to patient
B's response.

## Restore path

The model may or may not echo our tokens back. `restore()` is a literal
string replace; tokens not in the map are left alone (intentional — they
might be the model hallucinating a token-shaped string).

If the model hallucinates a token we DID send (e.g., `<<PHI_NAME_001>>`)
in a context that wasn't supposed to reference it, that's a bug in the
generation layer, not here.
