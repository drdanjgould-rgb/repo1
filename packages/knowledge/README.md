# @contourai/knowledge

Clinic content. Procedure pages, recovery guidance, consultation
process, and the no-prices-over-DM operational policy. Plain Markdown
files with YAML frontmatter; loaded at runtime by `loadAll()` /
`loadBySlug()`.

## What's here

```
docs/
  deep_plane_facelift.md        ← procedure page (facial)
  drainless_tummy_tuck.md       ← procedure page (body)
  recovery_general.md           ← general recovery + when-to-contact
  consultation_process.md       ← how a consult works
  pricing_policy.md             ← operational: how to decline price asks
  TODO_FOR_DR_GOULD.md          ← what Dr. Gould needs to review for v1+v2
```

## Frontmatter contract

```yaml
---
slug: deep_plane_facelift
title: Deep Plane Facelift
tags: [facial, surgical]
last_reviewed: 2026-05-18
reviewed_by: PLACEHOLDER # initials when reviewed
---
```

All five fields are required. Missing or empty → loader throws at boot.

## Usage

```ts
import { loadBySlug, loadAll } from '@contourai/knowledge';

const facelift = await loadBySlug('deep_plane_facelift');
//  -> { slug, title, tags, lastReviewed, reviewedBy, content }

const all = await loadAll();
//  -> KnowledgeDoc[]
```

The Concierge worker (step 5b) concatenates the relevant docs into a
cacheable system block alongside the system prompt, so prompt caching
covers both.

## Authoring rules (enforced by tests)

- **Under 600 words** per doc body.
- **No banned phrases** (`@contourai/safety/containsBannedPhrase`
  scans every doc at test time).
- **Frontmatter complete** — slug, title, last_reviewed, reviewed_by.
- **Structural and factual** — no marketing tone, no promises of
  outcomes, no specific pricing.
- **End each doc with "What we do not say in DM"** — a one-paragraph
  reminder for any human contributor of what's off-limits even when
  the doc itself contains adjacent info.

## Status

All five docs currently read `reviewed_by: PLACEHOLDER`. The
`loader.test.ts` suite has a sentinel test asserting this — when Dr.
Gould signs off on a doc, flip the `reviewed_by` field to his initials
AND update the test. Until then, the worker is not approved to ship
autonomously.

## Tests

`pnpm --filter @contourai/knowledge test`

- All 5 expected docs load
- Frontmatter validation
- Word-count ceiling (< 600)
- Banned-phrase scan across every doc body
- Specific content checks: pricing-policy rule, recovery red flags
- Sentinel: reviewedBy === 'PLACEHOLDER' (flip when reviewed)
