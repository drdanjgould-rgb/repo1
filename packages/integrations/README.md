# @contourai/integrations

Typed clients for every external service the agents call. The contract:
**no raw `fetch` in business logic — every external call goes through a
typed client in this package** (per `CLAUDE.md`).

## What's here

| Client                | Surface               | Used for                                          |
| --------------------- | --------------------- | ------------------------------------------------- |
| `RealMailchimpClient` | upsertMember, addTags | warm/hot lead enrollment + tagging (v1 sequencer) |
| `RealSheetsClient`    | appendRow             | MVP leads-mirror failsafe for Dr. Gould's office  |

Each client returns `Result<T, IntegrationError>` — never throws.
Integration failures must not block the patient-reply path. The
Concierge worker decides whether to retry, escalate, or carry on.

## Usage

```ts
import { RealMailchimpClient, RealSheetsClient } from '@contourai/integrations';

const mc = new RealMailchimpClient({ apiKey: 'abc123-us20' });
const result = await mc.upsertMember({
  listId,
  email: 'sarah@example.com',
  firstName: 'Sarah',
  status: 'subscribed',
});
if (!result.ok) {
  log.warn({ kind: result.error.kind, status: result.error.status }, 'mailchimp upsert failed');
} else {
  await mc.addTags({ listId, email: 'sarah@example.com', tags: ['contourai:hot_lead'] });
}
```

## Test utilities

`@contourai/integrations/test-utils` exports in-memory fakes:

- `FakeMailchimpClient` — records calls, accumulates tags, supports
  scripted errors via `.failNext`.
- `FakeSheetsClient` — records appends, tracks rows by
  `(spreadsheetId, range)`.

The Concierge worker tests inject these so no integration network calls
happen in CI.

## Error model

```ts
type Result<T, E = IntegrationError> = { ok: true; value: T } | { ok: false; error: E };

interface IntegrationError {
  kind: 'http' | 'auth' | 'rate_limit' | 'validation' | 'timeout' | 'network' | 'unknown';
  message: string;
  status?: number;
  retryable: boolean;
}
```

Callers must read `retryable` before retrying; we don't retry inside the
client (avoids hidden latency and stale state on the integration side).

## Tests

`pnpm --filter @contourai/integrations test`

- subscriberHash matches Mailchimp's documented MD5 spec
- FakeMailchimpClient: upsert, tag accumulation, member-not-found, scripted errors
- RealMailchimpClient constructor: requires `-<dc>` suffix on the API key
- FakeSheetsClient: append + row indexing + (spreadsheet, range) scoping + scripted errors

The real clients are smoke-tested at construction; HTTP behavior is
exercised against the real services in dev (with secrets) and in
integration tests (lands when CI has secrets).
