# packages/integrations — Conventions

## Must

- **Every external HTTP call lives here.** Worker / API / dashboard code
  must not `fetch()` an external service directly. If a new service is
  needed, add a client to this package first.
- **Return `Result`, don't throw.** Integration failures are normal; the
  caller decides what's fatal.
- **`retryable: true|false` is part of the contract.** Set it carefully —
  the Concierge worker uses it to decide whether to enqueue a retry.
- **Timeout every request.** Default 10s, override per client.

## Never

- Retry inside the client. Retries belong to the worker (where backoff
  and dead-letter routing live).
- Log raw response bodies. They may contain PHI (Mailchimp member objects
  echo email + names; Sheets responses can include the values we wrote).
  Log identifiers and status codes only.
- Cache an access token in module scope across clients. Each client owns
  its own auth state; sharing breaks when a clinic-scoped client
  switches credentials.

## Adding a new client

1. Subdirectory under `src/<service>/` with `types.ts`, `client.ts`,
   `index.ts`.
2. Public interface in `types.ts` — implementation-agnostic; the
   `RealXxxClient` and `FakeXxxClient` both satisfy it.
3. Export from `src/index.ts` and `src/test-utils/index.ts`.
4. Smoke tests against the fake; constructor / argument validation tests
   against the real client. Hitting the real service belongs in the
   integration test tier (lands when CI secrets are wired).
5. Update the table in README.md.

## PHI surface

Outbound to Mailchimp: email, first/last name, custom merge fields. All
PHI under HIPAA. Until the BAA with Anthropic is signed (and a separate
BAA with Mailchimp; out of scope), the Concierge worker MUST run
`@contourai/phi-redact` and pass only opted-in contact info here.

Outbound to Sheets: rows from `leads`. Same constraint — opt-in
required, redacted snapshots only.
