# TODO for Dr. Gould — Knowledge content review

The five seed knowledge docs (`*.md` in this directory) are written by
engineering as a working starting point. Before the Concierge ships
autonomously at Gould Plastic Surgery, **every doc needs your review and
sign-off**. The `reviewed_by` field in each frontmatter currently reads
`PLACEHOLDER`; set it to your initials when you've reviewed the file
and the date in `last_reviewed`.

## What I need from you for v1

### Every doc

1. **Read through** for medical accuracy. Flag anything wrong, imprecise,
   or that you wouldn't say to a patient.
2. **Tone check** — does this read like you? Like your senior RN coordinator?
   Mark sentences that should be deleted, softened, or sharpened.
3. **Sign off**: set `reviewed_by` to your initials, set
   `last_reviewed` to today's date.

### Procedure docs (`deep_plane_facelift.md`, `drainless_tummy_tuck.md`)

4. Confirm or correct the recovery timelines. I've given conservative
   ranges; you have the actual numbers.
5. Confirm or expand the companion-procedures list.
6. Add any technique nuance that comes up frequently in DMs that the
   bot should know about. For example: vertical platysmaplasty,
   high-SMAS variants, your specific approach to pannus pattern, etc.

### `recovery_general.md`

7. Confirm the **when-to-contact** list. This is the highest-stakes
   section because it drives escalation behavior. Add or remove
   symptoms; tighten the language.

### `consultation_process.md`

8. Confirm: visit length, who the patient sees, what's included, the
   virtual-consult policy, the post-consult communication.
9. Photo / imaging policy — what's standard, what's optional.

### `pricing_policy.md`

10. Confirm the approved-language phrases sound like you. Add or revise.
11. Confirm the insurance / financing notes. Which financing partners?
    What's the practice's actual stance on revisions pricing?

## What I need from you for v2 (not blocking v1)

- A list of additional procedures you want represented (breast, body,
  non-surgical, skin) with one knowledge doc each.
- An FAQ doc covering questions that come up repeatedly — what to bring
  on the day of surgery, anesthesia options, lodging recommendations
  for out-of-town patients, etc.
- Your specific banned phrases (beyond the system-wide list) that you'd
  never want the bot to use.
- Your specific approved phrases — turns of phrase that feel like you
  and the bot should use often.
- Voice-cone samples: 5–10 examples of real DMs your team has sent that
  embody the voice. These become the gold-standard for evals.

## Process

When you're ready to review:

1. Edit the docs directly in the repo, or send back marked-up versions.
2. Update `reviewed_by` and `last_reviewed` on the docs you've signed off.
3. Anything you want me to write before you review — let me know.

Until **all five docs** have your sign-off (i.e., none still read
`reviewed_by: PLACEHOLDER`), the worker is not approved to go live
autonomously. The CI eval gate enforces this in step 8.
