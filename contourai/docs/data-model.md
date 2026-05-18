# Data Model

Postgres is the source of truth. The schema below is the same one `migrations/0001_initial.sql` ships. JSONB columns (`profile`, `metadata`, `lead_scoring_weights`) absorb most early-stage schema churn — promote a key to a real column only when we query/index it.

## Table overview

```
clinics ──┬── patients ──┬── conversations ── messages
          │              ├── leads
          │              ├── appointments
          │              └── escalations
          └── events  (audit log, append-only)
```

## DDL (summary)

> Full DDL is in `migrations/0001_initial.sql`. Showing the shape here so you don't have to chase files.

### `clinics`
Multi-tenant root. Every other row carries a `clinic_id` FK.

| Column                  | Type        | Notes                                          |
|-------------------------|-------------|------------------------------------------------|
| id                      | uuid PK     |                                                |
| name                    | text        |                                                |
| slug                    | text UNIQUE | URL-safe identifier                            |
| timezone                | text        | IANA tz (e.g. `America/Los_Angeles`)           |
| service_area_zips       | text[]      | Used by lead scoring                           |
| lead_scoring_weights    | jsonb       | Overrides default weights (see patient-journey)|
| ghl_location_id         | text        | Phase-1 GHL sync target                        |
| meta_page_id            | text        | IG/FB business page                            |
| created_at              | timestamptz |                                                |

### `patients`
A person known to a clinic. Lifecycle anchor for the state machine.

| Column           | Type        | Notes                                                       |
|------------------|-------------|-------------------------------------------------------------|
| id               | uuid PK     |                                                             |
| clinic_id        | uuid FK     |                                                             |
| display_name     | text        | "Sarah J." — first known name                               |
| email            | citext      | Nullable until provided                                     |
| phone            | text        | E.164 format                                                |
| handles          | jsonb       | `{"instagram": "@sarah", "tiktok": "sarah_j", "twilio": "+1..."}` |
| journey_state    | text        | enum, see `patient-journey.md`                              |
| profile          | jsonb       | Free-form patient attrs (interests, procedures, notes)      |
| consent_marketing| bool        | Default false. SMS/email require explicit opt-in            |
| last_seen_at     | timestamptz |                                                             |
| created_at       | timestamptz |                                                             |

UNIQUE: `(clinic_id, handles->>'instagram')` partial WHERE handles ? 'instagram'. Same pattern for tiktok and phone. Lets us idempotently resolve patients by channel handle.

### `conversations`
One per (patient, channel). Threads stay open indefinitely; we don't close
conversations the way support tools do.

| Column        | Type        | Notes                                              |
|---------------|-------------|----------------------------------------------------|
| id            | uuid PK     |                                                    |
| clinic_id     | uuid FK     |                                                    |
| patient_id    | uuid FK     |                                                    |
| channel       | text        | `instagram`, `tiktok`, `sms`, `voice`, `web`       |
| platform_thread_id | text   | Meta thread id, Twilio conversation sid, etc.      |
| last_message_at| timestamptz |                                                   |

UNIQUE: `(clinic_id, channel, platform_thread_id)`.

### `messages`
Append-only. Idempotent on platform message id.

| Column            | Type        | Notes                                       |
|-------------------|-------------|---------------------------------------------|
| id                | uuid PK     |                                             |
| conversation_id   | uuid FK     |                                             |
| direction         | text        | `inbound` / `outbound`                      |
| sender            | text        | `patient` / `bot` / `human`                 |
| body              | text        | Message text                                |
| attachments       | jsonb       | URLs + types                                |
| platform_msg_id   | text        | Idempotency key                             |
| llm_metadata      | jsonb       | model, tokens, intent, score, latency       |
| created_at        | timestamptz |                                             |

UNIQUE: `(conversation_id, platform_msg_id)` — webhook retry safety.

### `leads`
One row per patient per "lead lifecycle." A patient can have multiple leads
over time (came in 2025 for Botox, came back 2026 for rhinoplasty).

| Column         | Type        | Notes                                            |
|----------------|-------------|--------------------------------------------------|
| id             | uuid PK     |                                                  |
| clinic_id      | uuid FK     |                                                  |
| patient_id     | uuid FK     |                                                  |
| source         | text        | `instagram_dm`, `tiktok_dm`, `web`, `after_hours_voice` |
| intent         | text        | `pricing`, `booking`, `info`, `complaint`, ...  |
| procedure      | text        | Free-form, classifier-extracted                  |
| score          | int         | 0–100 (see patient-journey.md)                   |
| status         | text        | `open`, `won`, `lost`                            |
| metadata       | jsonb       |                                                  |
| created_at     | timestamptz |                                                  |
| closed_at      | timestamptz |                                                  |

### `appointments`
Mirror of what's in GHL/Calendly so the bot can answer "when is my visit?"

| Column         | Type        | Notes                                       |
|----------------|-------------|---------------------------------------------|
| id             | uuid PK     |                                             |
| clinic_id      | uuid FK     |                                             |
| patient_id     | uuid FK     |                                             |
| external_id    | text        | GHL appointment id                          |
| starts_at      | timestamptz |                                             |
| kind           | text        | `consult`, `pre_op`, `surgery`, `post_op`   |
| status         | text        | `scheduled`, `completed`, `no_show`, `cancelled` |

### `escalations`
Every red-flag triage event lives here. Permanent record for compliance.

| Column          | Type        | Notes                                       |
|-----------------|-------------|---------------------------------------------|
| id              | uuid PK     |                                             |
| clinic_id       | uuid FK     |                                             |
| patient_id      | uuid FK     |                                             |
| message_id      | uuid FK     | Triggering message                          |
| reason          | text        | `red_flag_medical`, `human_handoff_request`, `complaint`, `compliance` |
| severity        | int         | 1–5                                         |
| notified_at     | timestamptz | When clinic was alerted                     |
| resolved_at     | timestamptz |                                             |
| notes           | text        |                                             |

### `events`
Append-only audit log. Every state transition, every outbound message, every
sync to GHL writes one row. Powers debugging, BI, and "what did the bot do?"
investigations.

| Column      | Type        | Notes                                            |
|-------------|-------------|--------------------------------------------------|
| id          | bigserial PK|                                                  |
| clinic_id   | uuid FK     |                                                  |
| patient_id  | uuid FK     | Nullable (system events)                         |
| kind        | text        | `state_changed`, `msg_sent`, `ghl_sync`, ...     |
| payload     | jsonb       |                                                  |
| created_at  | timestamptz |                                                  |

## What's intentionally missing

- **Users / staff table.** Until the SaaS dashboard exists, clinic staff use
  GHL's user model. Adding our own users now would be premature.
- **Billing.** No subscription/invoice tables until Q2 2026 SaaS rollout.
- **EMR mirror.** Patient medical records stay in the EMR. ContourAI only ever
  knows enough to *route* — we are deliberately not a clinical record system.
- **Vector store for FAQ.** Phase 1 ships clinic FAQ as a literal string in
  the system prompt with prompt caching. We add embeddings only if FAQ grows
  beyond ~5k tokens per clinic.

## HIPAA notes

The schema is HIPAA-shaped (PHI lives in `patients`, `messages`, `escalations`)
but the infra to host it is not. Before any non-Gould clinic goes live:

- Move to a BAA-covered host (AWS, GCP, or Render HIPAA tier).
- Encrypt PHI columns at rest (pgcrypto or column-level KMS).
- Audit log retention ≥ 6 years (move `events` to cold storage after 1y).
- Add `phi_access_log` table tied to every read of `patients`/`messages`.

Tracked in `roadmap.md` as a Phase 2 gate.
