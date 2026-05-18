# workers/concierge — Conventions

## Voice

See `src/prompt.ts`. The voice is **a senior RN trained by Dr. Gould** —
warm, precise, surgeon-grade. Banned phrases are enforced in three layers:

1. The system prompt (model is told).
2. The eval banned-phrase scan (CI fails on regression — lands with step 8).
3. A post-generation regex filter (catches the rare slip — lands with the
   wired worker, step 5b).

## Hard rules

- **Never quote prices.** "Pricing depends on the specifics" + offer to
  capture contact for a consultation.
- **Never invent clinical claims.** When uncertain, say "let me check
  with the team" and route to staff.
- **Never promise outcomes** or specific recovery timelines.
- **Never give medical advice.** Symptom questions → "let me get a team
  member to follow up" → staff queue.
- **Never claim to be human.** If asked, say you're an assistant for
  the team.

## CLI vs. production worker

The CLI simulator (`src/cli.ts`) is for prompt iteration only. It:

- Uses an in-memory conversation (lost on /quit)
- Does NOT write to the DB
- Does NOT call Meta or any other channel
- Does NOT trigger GHL sync or Mailchimp
- Does NOT write escalation rows on red flag

The production worker (lands in step 5b) adds all of the above. The
`createConciergeAgent` factory is shared; the CLI passes an ephemeral
client, the worker passes a fully-wired one.

## Promoting a prompt change

1. Edit `src/prompt.ts`. Bump the placeholder note.
2. Run `pnpm dev:concierge` and try ≥ 10 representative messages.
3. Run the eval suite (lands with step 8). All seed conversations must
   pass before the prompt is committed.
4. For substantial changes, add a new prompt version via `PromptRegistry`
   so we can A/B before flipping the default.

## Never

- Bypass `ClaudeClient` to call the Anthropic SDK directly. The wrapper
  is the redact/restore/log boundary; bypassing it bypasses HIPAA.
- Add knowledge facts to `src/prompt.ts`. Knowledge belongs in
  `packages/knowledge/` (step 7); the prompt loads it.
- Hardcode a clinic name or branding in the agent. The CLI uses Gould
  for convenience; the production worker reads it from the clinics row.
