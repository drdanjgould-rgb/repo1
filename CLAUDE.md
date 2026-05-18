# ContourAI — Engineering Conventions

These are the rules every contributor (human or agent) follows when working
in this repo. Project overview lives in `README.md`; this file is conventions
only.

## Stack snapshot

- TypeScript, Node 20, pnpm + Turborepo.
- Hono (API), Inngest (workflows), Drizzle (DB), Supabase (Postgres + Auth + Vault).
- Anthropic Claude — **Sonnet 4.6** (generation), **Haiku 4.5** (intent
  classification), **Opus 4.7** (safety classifier).
- Pino → Axiom logs. PostHog product analytics. Vitest tests.

## Code conventions

- **TypeScript strict.** No `any` without an inline `// eslint-disable-next-line
@typescript-eslint/no-explicit-any -- <reason>` comment. The reason must
  describe why a typed alternative isn't viable, not just "needed to compile."
- **Pure functions where possible.** Side effects isolated to adapters under
  `packages/integrations/`.
- **No raw `fetch` in business logic.** Every external call goes through a
  typed client in `packages/integrations/`.
- **Errors are never silently caught.** Use a `Result<T, E>` pattern or rethrow
  with context. `catch (e) {}` is an ESLint error.
- **Structured logging via Pino.** Every log line carries `clinic_id`,
  `conversation_id`, and `module`. PHI never appears in logs — the redaction
  layer (`packages/phi-redact`) runs before any log call that includes message
  content.
- **No `console.log` in committed code.** Use the structured logger.

## PHI & safety rules (non-negotiable)

- All PHI is redacted via `packages/phi-redact` before any external LLM call,
  any log line containing message content, or any analytics event.
- Every outbound patient-facing message is persisted with `{prompt, completion,
model, latency_ms, redaction_map}` to the `messages` table.
- The safety classifier in `packages/safety` runs on every inbound message in
  every module. A red-flag verdict short-circuits the agent and escalates to
  staff.
- **No invented clinical claims.** If the knowledge base doesn't cover a
  question, escalate to staff queue with a holding message — never improvise.
- **No prices over DM.** Enforced in three layers: system prompt, eval
  banned-phrase scan, post-generation regex filter.
- **Banned phrases** (system-wide): "transformation," "reset," "anti-aging,"
  "best version of yourself," "journey," "rejuvenate" as a standalone claim.
  Maintained centrally in `packages/safety/banned-phrases.ts`.

## Tests

- Vitest. Every package ships at least a smoke test before merge.
- PHI redaction has its own ≥25-pattern suite. Adversarial cases (real-name
  false negatives, false-positive non-PHI like "John Deere") are required.
- Safety classifier evals are gating: 100% red-flag recall is required to
  merge any change to `packages/safety` or any agent prompt that affects
  routing.
- Module eval suites run in CI and gate live-webhook wire-up. A module is
  not "done" until its eval suite is green.

## Logging schema

Every log entry includes:

```ts
{ clinic_id?: string; conversation_id?: string; module: string; level: ...; msg: string }
```

`module` is the package or worker name (e.g., `'workers/concierge'`,
`'packages/safety'`). Add other context fields freely; never include raw
message content unless it has been through `redact()`.

## Commits

- Conventional Commits: `feat(scope): summary`, `fix(scope): summary`, etc.
- One branch per module. Branch name `module/<slug>` or `feat/<slug>`.
- Pre-commit hook runs `lint-staged` (eslint + prettier on touched files)
  and `pnpm typecheck`. If typecheck becomes slow, move it to CI; never
  bypass with `--no-verify` without surfacing it in the PR description.

## Working with Claude Code in this repo

- This file (`CLAUDE.md`) and `README.md` are the canonical project context.
  Skill files under `ads/`, `skills/`, `agents/`, `evals/`, `research/`,
  `scripts/`, `assets/` belong to a prior repo identity (Claude Ads skill)
  and are **not** part of ContourAI. Ignore them when reasoning about this
  codebase.
- The `contourai/` subdirectory is a legacy Python scaffold from an early
  design pass. Reference only; do not extend.
- The active codebase is the TS monorepo at the repo root (`apps/`,
  `packages/`, `workers/`, `infra/`).

## Sub-paths get their own CLAUDE.md as packages mature

- `packages/phi-redact/CLAUDE.md` — redaction rules, performance budget,
  threat model.
- `packages/safety/CLAUDE.md` — red-flag taxonomy, model choice rationale,
  escalation contract.
- `workers/concierge/CLAUDE.md` — voice, tone, banned phrases, knowledge
  base contract.

These land as the packages do; they are not pre-created.
