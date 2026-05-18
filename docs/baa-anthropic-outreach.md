# BAA Outreach — Anthropic

**Owner:** DJ (COO) — to send.
**Status:** Draft, ready to send.
**Last updated:** session 1.

## Why this exists

ContourAI is a HIPAA-adjacent product: aesthetic-surgery practices use it to
respond to patient DMs, voice calls, and post-op messages. Inbound content
will contain protected health information (PHI): symptoms, post-op
complications, medication mentions, identifiable details. Routing PHI to a
third-party LLM without a Business Associate Agreement (BAA) in place is not
HIPAA-compliant.

Until a BAA with Anthropic is executed, our `packages/phi-redact` layer
redacts all PHI before any external LLM call. Redaction is good defense in
depth, but it degrades model performance (tokenized names lose conversational
warmth; tokenized dates lose temporal reasoning). The BAA lets us send
fully-formed messages to Claude and rely on Anthropic's HIPAA controls,
while keeping redaction in place as belt-and-braces for any non-BAA fallback
provider.

## Outreach

**To.** Anthropic enterprise sales / commercial team.
**Channel.** Existing rep if one is assigned, otherwise sales@anthropic.com
with subject "BAA + commercial agreement — ContourAI (healthcare adjacent)."

**Draft email below.** One screenful, asks for the BAA path and the SLA for
execution.

---

> Subject: BAA + commercial agreement — ContourAI (healthcare adjacent)
>
> Hi,
>
> I'm DJ, COO of ContourAI. We're building an AI operating system for
> aesthetic-surgery practices — lead capture, patient education, post-op
> follow-up, after-hours coverage — with Claude as the primary model
> (Sonnet 4.6 for generation, Haiku 4.5 for classification, Opus 4.7 for
> safety triage). Our first deployment is Dr. Daniel Gould's practice in
> Beverly Hills, with a small beta cohort rolling Q3, and paid SaaS
> rollout in Q2 2026.
>
> The product handles protected health information: symptoms, post-op
> complications, identifiable patient details. We're building a PHI
> redaction layer as defense-in-depth, but we'd like to execute a
> **Business Associate Agreement** with Anthropic so we can send
> unredacted patient messages to Claude under HIPAA-compliant terms.
>
> Two specific asks:
>
> 1. **BAA timeline.** What's a realistic execution timeline (NDA →
>    redlines → signature)? We're targeting a soft launch at one practice
>    in July, broader beta in September.
> 2. **Commercial agreement.** Standard enterprise terms work; happy to
>    do a usage commitment if it accelerates BAA. Our v1 estimate is
>    ~$5–10k/month in Claude spend across the three model tiers.
>
> Some context:
>
> - Founding team: Dr. Daniel Gould (clinical, deploying in his own
>   practice), DJ (COO, infra), Matt Clemens (GTM).
> - Architecture: Postgres on Supabase (RLS, column-level encryption
>   via pgsodium), TypeScript monorepo, Claude calls only via our typed
>   client wrapper that runs the redaction layer before send.
> - Compliance posture: audit log via Postgres triggers (unbypassable),
>   PHI never logged or sent to analytics, secrets in encrypted Vercel/Fly
>   environments.
>
> Happy to share the architecture document and threat model on a call,
> or async — whichever moves faster. What's the cleanest next step on
> your side?
>
> Best,
> DJ
> COO, ContourAI

---

## Follow-up plan

- T+0: Send.
- T+3 business days: Bump if no reply.
- T+7 business days: Escalate via any warm intro (LinkedIn) the founders have.
- T+14: Surface in weekly founder review (Daniel + DJ + Mac) for unblocking.

## What we do while waiting

- Build `packages/phi-redact` as planned. The layer is required for any
  non-BAA fallback provider (OpenAI, etc.) and good practice regardless.
- Build the `LLM` client wrapper such that the redaction layer can be
  **toggled off per-call** once the Anthropic BAA is signed — we want to
  send full-fidelity content to Claude, while still redacting to any
  fallback. One flag on the call site, default on.
- Capture in `packages/agents/CLAUDE.md` (lands later this session): "BAA
  status flips this default."

## Decision criteria

We do not launch the live IG webhook at Gould Plastic Surgery until **one
of**:

1. BAA executed with Anthropic, OR
2. The redaction layer has passed adversarial review on ≥100 real-shaped
   patient messages with zero leaks AND the legal lead (TBD) signs off on
   the redacted-only posture as HIPAA-acceptable for marketing-channel DMs.

Path 1 is cleaner. Path 2 is a fallback; the redaction layer needs to be
that good either way.
