# @contourai/phi-redact

PHI/PII detection and tokenization. Runs before every external LLM call,
every log line that includes message content, and every analytics event.

## API

```ts
import { redact, restore, assertNoPhi, PhiLeakError } from '@contourai/phi-redact';

// Outbound to an LLM:
const { redacted, map } = redact(patientMessage);
const llmReply = await claude(`Reply to: ${redacted}`);
const finalReply = restore(llmReply, map); // tokens → originals

// Defensive: before logging or any non-BAA external call
assertNoPhi(stringDestinedForLogs); // throws PhiLeakError on hit
```

## What's detected

| Kind    | Examples                                                              |
| ------- | --------------------------------------------------------------------- |
| EMAIL   | `sarah@example.com`, `me+tag@mail.x.com`                              |
| PHONE   | `(310) 555-1234`, `310-555-1234`, `+1 310.555.1234`, `3105551234`     |
| MRN     | `MRN: 12345678`, `MR# 12345`, `Patient ID 9876543`                    |
| DOB     | `DOB: 01/15/1985`, `Date of Birth: March 5, 1990`, `02-14-1978`       |
| ADDRESS | `123 Main Street`, `9201 Wilshire Blvd Suite 200`                     |
| ZIP     | `90210`, `90210-1234`                                                 |
| NAME    | `Dr. Smith`, `Sarah Johnson` (both in name lists), `my name is Sarah` |

## What's _not_ detected

- Names not in the built-in lists (extend with `additionalNames`)
- Free-form medical conditions ("severe migraine" — not PHI per HIPAA)
- Photos / attachments (handled separately, never sent to LLMs)
- Voice/audio (the voice agent has its own redaction layer)

## Approach

Deterministic regex passes in fixed order (longest/most-specific first):

1. **Email** (contains `@`)
2. **Phone** (specific digit grouping)
3. **MRN** (labeled medical IDs only)
4. **DOB** (labeled or full MM/DD/YYYY in 1900–2024 window)
5. **Address** (street + suffix)
6. **ZIP** (5- or 5+4-digit; runs after phone to avoid digit theft)
7. **Name** (Title+Last, First+Last via lists, intro+First)

Tokens are stable within a single `redact()` call: the same original gets
the same token (e.g., "Sarah" mentioned three times → `<<PHI_NAME_001>>`
three times).

## Bias

This layer over-redacts on purpose. False positives degrade model quality
(replies feel robotic); false negatives leak PHI. We prefer the former.
Once the Anthropic BAA is signed
(see `docs/baa-anthropic-outreach.md`) we can selectively send
unredacted content to Claude while keeping the redactor as
defense-in-depth for any non-BAA fallback provider.

## Name list

~200 common US first names and ~200 surnames (in `src/name-list.ts`).
Clinic-specific names go in `RedactOptions.additionalNames`. A small
brand blocklist suppresses common false positives ("John Deere", etc.).

## Performance

Single-pass regex chain; sub-millisecond on typical DM-length inputs.
No async, no allocation hot-path beyond the result string and map.

## Tests

`pnpm --filter @contourai/phi-redact test` runs:

- 27 positive PHI tests (email, phone, MRN, DOB, address, ZIP, names, mixed)
- 7 false-positive guards ("John Deere", "May 2026", "2-3 weeks", etc.)
- 2 options tests (additionalNames, blocklist)
- 4 restore round-trip tests
- 7 assertNoPhi tests

## Limits & known gaps

- Names: only catches list-name pairs and intro-context single names.
  Many real names will get through — that's a regression we accept and
  document; the LLM-level safety layer is the next net.
- International phones: only US-style. International formats pass through.
- Addresses: US-only.
- No fuzz/adversarial suite yet (`test/adversarial.test.ts` lands when
  we have real DM samples from Dr. Gould's office).
