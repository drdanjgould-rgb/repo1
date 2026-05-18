# @contourai/api

Hono server + Inngest binding for ContourAI. The webhook entrypoint
that turns a Meta DM into a durable `handleInboundDM` invocation.

## Routes

| Method | Path             | Purpose                                                            |
| ------ | ---------------- | ------------------------------------------------------------------ |
| GET    | `/healthz`       | liveness probe                                                     |
| GET    | `/webhooks/meta` | Meta subscription verification (`hub.challenge` echo)              |
| POST   | `/webhooks/meta` | Inbound DM — signature-verified, normalized, dispatched to Inngest |
| ANY    | `/inngest`       | Inngest function registration + invocation endpoint                |

## Local development

```bash
echo "ANTHROPIC_API_KEY=sk-ant-..." > apps/api/.env.local
echo "META_APP_SECRET=..." >> apps/api/.env.local
echo "META_VERIFY_TOKEN=$(openssl rand -hex 16)" >> apps/api/.env.local
echo "META_PAGE_TO_CLINIC_JSON='{\"<ig-page-id>\":\"<clinic-uuid>\"}'" >> apps/api/.env.local
echo "LIVE_WEBHOOKS_ENABLED=false" >> apps/api/.env.local       # default

pnpm --filter @contourai/api dev
# in another terminal:
ngrok http 3000
# point Meta webhook at https://<ngrok>.ngrok-free.app/webhooks/meta
# use META_VERIFY_TOKEN above as the verify token
```

With `LIVE_WEBHOOKS_ENABLED=false`, the webhook accepts and validates
signatures but does NOT publish Inngest events — returns
`{ status: 'dry_run', count: N }`. Useful for verifying Meta-side
configuration without firing the agent.

## Production wiring

`src/server.ts` builds the app from env config. The
`getOrchestratorDeps` factory in `server.ts` is intentionally a
throw-stub right now — the real wiring (Postgres pool, real Anthropic
client, real Mailchimp, real Sheets, real Meta send) lands once the
deployment story is locked in. Two reasons it's stubbed:

1. Builds OrchestratorDeps at boot, which means real credentials
   need to be present. We don't want a partial-config production
   start succeeding.
2. Inngest function bodies need a synchronous deps source. The
   factory exists; only the body is TODO.

When you fill it in, you'll instantiate:

- `createClient` from `@contourai/db/client` with the Supabase URL
- All six `drizzle*Repo` impls
- `createAnthropicTransport` + `ClaudeClient` from `@contourai/agents`
- `RealMailchimpClient`, `RealSheetsClient` from `@contourai/integrations`
- `RealMetaClient` (for the outbound send the orchestrator will call
  once that's wired through `OrchestratorDeps`)

## Inngest

We use Inngest for durability — Meta requires a < 10s ack, but the
orchestrator can take 2–5 seconds. The webhook publishes an event and
returns 200 immediately; the durable function consumes the event,
retries on failure, and reports outcomes to the Inngest dashboard.

Function registered: `concierge.handle-inbound-dm`
Event consumed: `concierge/inbound.received`

## Feature flag

`LIVE_WEBHOOKS_ENABLED` defaults to `false`. Three layers gate flipping
to `true`:

1. Eval suite (`pnpm eval:concierge`) green — 10/10, 0 safety misses.
2. Dr. Gould has signed off on all five knowledge docs
   (no PLACEHOLDER `reviewed_by`).
3. BAA executed with Anthropic OR redaction-only posture approved by
   the legal lead (see `docs/baa-anthropic-outreach.md`).

## Tests

`pnpm --filter @contourai/api test`

- Meta signature verification (good, tampered, missing, malformed)
- GET verify handshake (challenge echo, wrong token → 403)
- POST dispatch behavior (live vs dry-run)
- Echo / delivery / read receipt filtering in `normalizeMetaPayload`
- End-to-end orchestrator binding (via direct `handleInboundDM` call,
  same as Inngest's step.run would execute)

The Inngest runtime itself is not exercised in CI — that needs the
Inngest dev server. Smoke-test locally with `npx inngest-cli@latest dev`.
