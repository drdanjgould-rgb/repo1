# Architecture

## Guiding principles

1. **One platform, five modules.** Concierge, After-Hours, Post-Op, Lead Engine,
   and Growth Coach share the same data model and the same orchestration loop.
   They differ only in *channel* (IG/SMS/Voice) and *prompts*.
2. **Own the orchestration; rent the channels.** We own patient state and the
   agent loop. Twilio, Meta, and GHL are replaceable adapters.
3. **GHL is a Phase-1 dashboard, not a system of record.** Postgres is the
   source of truth. GHL gets a one-way sync so clinicians have a UI they
   already know. When we ship the SaaS dashboard, GHL becomes optional.
4. **Multi-tenant from day 1.** Every row has a `clinic_id`. Onboarding the
   3 beta clinics in Q3 is a config change, not a fork.
5. **Red-flag triage is non-negotiable.** Any module that talks to a patient
   must run the safety classifier before it sends.

## High-level diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                          CHANNEL ADAPTERS                            │
│                                                                      │
│  Meta Graph API     Twilio Voice/SMS     Web Chat     Email (later)  │
│   (IG/FB DMs)        (After-Hours)       (Recovery)                  │
└──────┬────────────────┬──────────────────┬──────────────────────────┘
       │ webhooks       │ webhooks         │
       ▼                ▼                  ▼
┌──────────────────────────────────────────────────────────────────────┐
│                       FASTAPI (apps/api)                             │
│                                                                      │
│  /webhooks/meta   /webhooks/twilio   /webhooks/web                  │
│         │                 │                 │                        │
│         └────────┬────────┴────────┬────────┘                        │
│                  ▼                 ▼                                 │
│         ┌─────────────────┐  ┌─────────────────┐                     │
│         │ ConciergeAgent  │  │ TriageAgent     │                     │
│         │ (per module)    │  │ (red-flag       │                     │
│         │                 │  │  classifier)    │                     │
│         └────────┬────────┘  └─────────────────┘                     │
│                  │                                                   │
│         ┌────────▼────────────────────────────┐                      │
│         │  LLM service (Anthropic by default) │                      │
│         │  - intent classify                  │                      │
│         │  - response generate                │                      │
│         │  - prompt caching enabled           │                      │
│         └─────────────────────────────────────┘                      │
└──────┬───────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────────────┐
│                       POSTGRES (source of truth)                     │
│  clinics, patients, conversations, messages,                         │
│  leads, appointments, escalations, events                            │
└──────┬───────────────────────────────────────────────────────────────┘
       │ sync (background worker)
       ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    GHL (Phase 1 dashboard only)                      │
│             contacts ⟵ patients,  notes ⟵ messages,                  │
│             tags ⟵ lead score / state                                │
└──────────────────────────────────────────────────────────────────────┘
```

## Why FastAPI + Postgres + Anthropic

- **FastAPI** — async, typed, fast to ship; same code can host webhooks +
  internal API for the future dashboard. Sync handlers for Meta webhooks
  (must reply <10s); background tasks for LLM calls + sync.
- **Postgres** — rich enough for everything we need short of warehouse-scale
  analytics. `JSONB` columns let us evolve the schema without migrations on
  every iteration.
- **Anthropic Claude (Sonnet 4.6 default, Opus 4.7 for safety classifier)** —
  prompt caching cuts the system-prompt cost ~90% at DM volumes; tool use
  is reliable for the structured "intent + score + reply" output we need.
  The `LLM` service is an interface; swapping to OpenAI is one config line.

## What the agent loop actually does

For each inbound message from any channel:

1. **Normalize** — adapter converts platform payload into a canonical
   `InboundMessage{patient_handle, channel, text, attachments, ts}`.
2. **Resolve patient** — match by handle within `clinic_id`; create if new.
3. **Persist** — write to `messages` (idempotent on platform message id).
4. **Safety check** — run `TriageAgent` first. If red-flag,
   short-circuit: notify clinic, log escalation, send a holding reply.
5. **Classify** — intent (price, booking, education, complaint, …) +
   urgency (1–5) + lead score delta.
6. **Retrieve context** — last N messages + patient profile + clinic FAQ.
7. **Generate** — module-specific system prompt + context → reply.
8. **Send** — channel adapter (Meta/Twilio) posts the outbound message.
9. **Sync** — background task writes contact/note/tag updates to GHL.
10. **Advance state** — patient-journey state machine transitions
    (see `patient-journey.md`).

Steps 4–7 happen inside the request handler so we can reply fast; steps 8–10
are queued via FastAPI `BackgroundTasks` (Phase 1) or a real queue (Celery/
RQ/Arq) when traffic warrants.

## What's deliberately not in v1

- **Custom dashboard UI.** GHL is the operator UI until SaaS rollout (Q2 2026).
- **EMR integration.** Hooks are stubbed; real EMR work is a Phase 3 task.
- **Voice in Phase 1.** Twilio Voice + Realtime API design is in
  `roadmap.md` but the code lands after the concierge is in production at
  Dr. Gould's office.
- **Webhooks signature verification across every provider.** Meta is
  implemented; Twilio and GHL are stubs marked `TODO` for security review.
- **HIPAA-grade infra.** Postgres + FastAPI on a HIPAA-eligible host (AWS w/
  BAA, GCP w/ BAA, or Render's HIPAA tier) is required before the first
  non-Gould clinic. Tracked in `roadmap.md` as a Phase 2 gate.
