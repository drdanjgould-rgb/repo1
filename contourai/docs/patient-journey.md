# Patient Journey — State Machine

Every patient at every clinic is in exactly one of these states at all times.
Every module (Concierge, After-Hours, Post-Op, Lead Engine) reads and advances
this state machine. The state lives on `patients.journey_state` in Postgres.

## States

| State              | Meaning                                                    | Owning module        |
|--------------------|------------------------------------------------------------|----------------------|
| `new_lead`         | First inbound message received. No contact info yet.       | Concierge            |
| `qualifying`       | Bot is collecting name / interest / contact / urgency.     | Concierge            |
| `nurturing`        | Educational content sent; awaiting patient reply.          | Concierge            |
| `consult_scheduled`| Appointment booked (link clicked or scheduled by staff).   | Concierge → human    |
| `consult_complete` | Consult done; surgery may or may not be scheduled.         | Human                |
| `pre_op`           | Surgery date set. Pre-op education sequence active.        | Med Assistant        |
| `post_op_d0_d14`   | In recovery window. Daily check-in sequence active.        | Post-Op Recovery     |
| `recovery_complete`| Day 14+ passed; surgical recovery considered nominal.      | —                    |
| `review_solicit`   | Asking for Google/Yelp/RealSelf review.                    | Concierge            |
| `reactivation`     | ≥ 90 days since last touch; periodic re-engagement.        | Concierge            |
| `escalated`        | Red flag detected OR patient asked for human. Paused.      | Human                |
| `closed_lost`      | Patient explicitly opted out or unreachable for >180 days. | —                    |

## Events

Events trigger transitions. Some are inbound (patient action), some are system.

| Event                  | Triggered by                                | Side effects             |
|------------------------|---------------------------------------------|--------------------------|
| `msg_inbound`          | Channel webhook                             | Persist message          |
| `msg_outbound`         | Bot or human reply                          | Persist message          |
| `intent_classified`    | LLM intent classifier                       | Update `leads.intent`    |
| `lead_scored`          | Scoring service                             | Update `leads.score`     |
| `red_flag_detected`    | TriageAgent                                 | → `escalated`, alert staff |
| `human_handoff`        | Operator clicks "take over" or patient asks | → `escalated`            |
| `booking_link_sent`    | Bot                                         | Start 48h booking timer  |
| `booking_confirmed`    | GHL/Calendly webhook                        | → `consult_scheduled`    |
| `consult_completed`    | Staff marks done in GHL                     | → `consult_complete`     |
| `surgery_scheduled`    | Staff sets surgery date                     | → `pre_op`               |
| `post_op_day_0`        | Surgery completed                           | → `post_op_d0_d14`       |
| `recovery_d14`         | 14 days post-surgery                        | → `recovery_complete`    |
| `review_received`      | Reputation integration                      | → `reactivation`         |
| `inactive_90d`         | Daily cron                                  | → `reactivation`         |
| `inactive_180d`        | Daily cron                                  | → `closed_lost`          |
| `opt_out`              | "STOP" or DM equivalent                     | → `closed_lost`          |

## Transition table

```
                       msg_inbound
new_lead  ─────────────────────────────►  qualifying
   │                                          │
   │  inactive_180d                           │ name+contact+intent captured
   │                                          ▼
   └──► closed_lost                       nurturing
                                              │
       booking_link_sent ─► (timer 48h) ──────┤
                                              │ booking_confirmed
                                              ▼
                                       consult_scheduled
                                              │ consult_completed
                                              ▼
                                       consult_complete
                                              │ surgery_scheduled
                                              ▼
                                            pre_op
                                              │ post_op_day_0
                                              ▼
                                       post_op_d0_d14
                                              │ recovery_d14
                                              ▼
                                       recovery_complete
                                              │ (auto, +3 days)
                                              ▼
                                       review_solicit
                                              │ review_received OR inactive_90d
                                              ▼
                                       reactivation
                                              │ inactive_180d
                                              ▼
                                       closed_lost


Any state ──── red_flag_detected ──► escalated
Any state ──── human_handoff      ──► escalated
Any state ──── opt_out            ──► closed_lost
```

## Lead scoring (used by transitions out of `qualifying`)

Lead score is a 0–100 integer recomputed on every inbound message. The bot
treats `score ≥ 70` as "hot" (sends booking link), `40–69` as "warm" (nurture
sequence), `< 40` as "cold" (long-form education + slow drip).

Inputs (additive, capped at 100):

| Signal                                  | Weight |
|-----------------------------------------|--------|
| Explicit booking ask ("can I book?")    | +40    |
| Asked about price                       | +20    |
| Named a specific procedure              | +15    |
| Provided phone number                   | +15    |
| Provided email                          | +10    |
| Local to clinic (zip in service area)   | +10    |
| Mentioned timeline ("by summer")        | +10    |
| Repeat engagement (3+ messages)         | +10    |
| Reacted to last clinic post (IG)        | +5     |
| Used vague / one-word reply             | −10    |
| Mentioned shopping ("comparing surgeons") | +5   |

Weights are clinic-tunable in `clinics.lead_scoring_weights` (JSONB) so Dr.
Gould's preferences don't get baked in as defaults for everyone else.

## Why a single state machine for all modules

Two reasons:

1. **Operators have one mental model.** When a clinic owner asks "where is
   patient X right now?", there is exactly one answer. Without the
   shared state machine, the Concierge would say "nurturing" while the
   Post-Op bot has no record of them, and vice versa.
2. **Cross-module handoff is free.** When `post_op_day_0` fires, the Concierge
   stops trying to upsell; when `escalated` fires, every module pauses
   outbound. No per-module flags to keep in sync.

## What the LLM is *not* allowed to decide

State transitions. The LLM can *propose* an intent or a score delta, but the
actual `journey_state` update is done by deterministic code in
`apps/api/services/state_machine.py`. This is a safety property: we never want
a hallucinated tool call to push a patient from `pre_op` to `closed_lost`.
