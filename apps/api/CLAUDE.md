# apps/api — Conventions

## Must

- **Verify Meta signatures on every POST.** Returns 401 on a mismatch.
  This is the only thing standing between us and a forgery sending
  fake patient DMs.
- **Ack within 10 seconds.** Meta will retry (and eventually drop)
  webhooks that don't 200 fast. Heavy work goes to Inngest; the
  webhook handler does nothing but verify, normalize, and `inngest.send`.
- **Default `LIVE_WEBHOOKS_ENABLED=false`.** In dry-run mode the
  endpoint validates everything and returns 200 but doesn't fire the
  agent. Flip the flag only after the three gates listed in README.md.
- **Read the raw body text BEFORE parsing JSON.** Signature verification
  is over the exact bytes Meta sent; once Hono / a middleware
  reformats, the HMAC fails. Use `c.req.text()`.

## Never

- Put business logic in webhook handlers. They normalize and dispatch.
  The orchestrator is the brain.
- Log raw webhook bodies in production. They contain patient DM text
  (PHI). Log identifiers + counts only.
- Bypass Inngest's `step.run()` in the durable function. Steps are
  what survive process crashes; bare `await` calls don't.
- Hardcode the page-id → clinic-id mapping for more than one clinic.
  The current `META_PAGE_TO_CLINIC_JSON` is provisional; replace with
  a `ClinicsRepo.findByMetaPageId(...)` lookup before the second
  clinic onboards.

## When to bump the Inngest function id

Whenever the durable function's event-handling semantics change
(retries, concurrency, dead-letter behavior). Inngest treats a new id
as a fresh function — old events in-flight on the old id keep their
old behavior. This is how to roll out a breaking change safely.

## Webhook payload variants we deliberately drop

- `message.is_echo === true` — our own outbound, echoed back.
- `delivery` — Meta's delivery receipts.
- `read` — patient read our message.
- Messages without `message.text` — reactions, GIFs, voice notes.
  Reactions might be worth handling in v2; out of scope for v1.
