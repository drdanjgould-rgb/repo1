# packages/knowledge — Conventions

## What lives here

Clinic-facing content the bot is allowed to ground on. Procedure pages,
recovery guidance, the no-prices policy. Nothing else — engineering
config, prompts, tone overrides live in their own packages.

## What does NOT live here

- The Concierge system prompt (lives in `workers/concierge/src/prompt.ts`)
- Tone overrides (lives in `clinics.settings.tone_overrides` JSONB, lands
  with the wired worker)
- Banned-phrase list (lives in `packages/safety/banned-phrases.ts`)
- Pricing numbers (NEVER. See `pricing_policy.md`.)
- Patient-specific information (PHI does not belong in source control)

## Adding a new doc

1. Create `docs/<slug>.md` with full frontmatter (slug, title, tags,
   last_reviewed, reviewed_by).
2. Add the slug to the `KnowledgeSlug` union in `src/types.ts`.
3. Add the slug to `EXPECTED_SLUGS` in `src/loader.ts` if it should be
   required at boot.
4. Add a test case in `test/loader.test.ts` covering any content the
   bot is expected to ground on.
5. Set `reviewed_by: PLACEHOLDER` until Dr. Gould signs off.

## Updating an existing doc

1. Edit the body.
2. Update `last_reviewed` to today.
3. If the change is material, set `reviewed_by: PLACEHOLDER` again so
   the sentinel test reminds Dr. Gould to re-sign.

## Voice / authorship rules

- Anatomically precise. "Midface descent" not "tired-looking face."
- Structural reasoning over aesthetic adjectives.
- No marketing tone. No promises. No specific recovery timelines for
  the individual patient.
- No banned phrases. The test suite scans every doc.
- Every doc ends with a "What we do not say in DM" paragraph as a
  contributor reminder.

## The PLACEHOLDER sentinel

The test `every doc currently lists PLACEHOLDER for reviewed_by` is
intentional. When Dr. Gould signs off:

1. Flip `reviewed_by` on the doc to his initials.
2. Update the sentinel test to assert the specific docs have signed off,
   or remove the test once all five are signed.

Until all five are signed, the worker is not approved to ship
autonomously. The eval gate in `packages/evals` (step 8) enforces the
same constraint at CI time.

## Never

- Quote a price.
- Add a "starting at" figure or range.
- Promise a specific outcome or timeline.
- Compare Gould Plastic Surgery to other practices.
- Make clinical claims that aren't established in the procedure docs.
