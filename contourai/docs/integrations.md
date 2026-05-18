# Integrations

External contracts. One section per provider; each has scope, auth, the
endpoints we actually use, and the failure model.

---

## Meta Graph API (Instagram + Facebook DMs)

**Scope.** Receive inbound DMs via webhook; send outbound DMs via Graph API.
TikTok is documented separately; the rest of Meta surfaces (comments, ads)
are out of scope for Phase 1.

**Required scopes (App Review).**
- `instagram_basic`
- `instagram_manage_messages`
- `pages_messaging`
- `pages_show_list`
- `business_management`

App must pass Meta App Review for `instagram_manage_messages`. Budget 2–4
weeks for this; we should submit during Phase 1 build, not after.

**Webhook endpoint.** `POST /webhooks/meta`

- Verify `X-Hub-Signature-256` against app secret (HMAC-SHA256 of raw body).
- Respond 200 within 10 seconds — process async via `BackgroundTasks`.
- Handle subscription verification (`GET /webhooks/meta?hub.mode=subscribe`).

**Inbound payload shape (relevant fields).**

```jsonc
{
  "object": "instagram",
  "entry": [{
    "id": "<ig_user_id>",
    "time": 1700000000,
    "messaging": [{
      "sender":    { "id": "<patient_psid>" },
      "recipient": { "id": "<page_id>" },
      "timestamp": 1700000000,
      "message": {
        "mid":  "<platform_msg_id>",
        "text": "...",
        "attachments": [{ "type": "image", "payload": { "url": "..." } }]
      }
    }]
  }]
}
```

**Outbound send.**

```
POST https://graph.facebook.com/v21.0/<page_id>/messages
Authorization: Bearer <page_access_token>
Content-Type: application/json

{ "recipient": { "id": "<patient_psid>" }, "message": { "text": "..." } }
```

**Rate limits.** ~200 calls/hour/user. We won't hit this at v1 volumes but
the outbound sender retries with backoff and emits `meta_rate_limited`
events for monitoring.

**Failure model.** Webhook retries 3× over 36h if we 5xx. We must be
idempotent on `message.mid` — that's the unique constraint on `messages`.

---

## TikTok DMs

Same model as Meta (webhook + send API). Officially TikTok's Business
Messaging API is in limited release; if access is not granted by Phase 1
deadline, we fall back to an "IG-only" launch and revisit. The adapter
interface (`apps/api/webhooks/tiktok.py`, not yet written) mirrors Meta so
swapping in is a single file.

---

## GoHighLevel (GHL) — Phase 1 dashboard

**Scope.** One-way sync from ContourAI → GHL. We do NOT read patient state
from GHL; Postgres is canonical. GHL is the UI clinics see.

**Auth.** OAuth 2.0 per location. Each clinic does a one-click connect at
onboarding; we store the refresh token in `clinics.metadata->>'ghl_refresh_token'`
(encrypted at rest).

**Endpoints used.**

| Action            | Endpoint                                   |
|-------------------|--------------------------------------------|
| Upsert contact    | `POST /contacts/upsert`                    |
| Add note          | `POST /contacts/{id}/notes`                |
| Add tag           | `POST /contacts/{id}/tags`                 |
| Custom fields     | included in upsert body                    |

**Custom fields we write.**
- `contourai_lead_score` (number)
- `contourai_journey_state` (text)
- `contourai_last_intent` (text)
- `contourai_procedure` (text)
- `contourai_last_msg_at` (datetime)

**Tag conventions.** Prefix `contourai:` so clinic-defined tags don't collide.

```
contourai:hot_lead
contourai:warm_lead
contourai:cold_lead
contourai:state_<state>
contourai:procedure_<slug>
```

**Failure model.** Sync worker retries with exponential backoff up to 24h.
After that, we mark the contact `sync_failed` and emit a Slack/email alert
for the clinic admin to reconnect.

---

## Twilio (After-Hours, Post-Op SMS) — Phase 2

**Scope.** Voice (Realtime API ↔ Twilio Media Streams) for after-hours,
plus outbound SMS for post-op sequences. Inbound SMS support uses the same
ConciergeAgent.

**Endpoints.**

| Action               | Endpoint                                      |
|----------------------|-----------------------------------------------|
| Inbound voice (TwiML)| `POST /webhooks/twilio/voice`                 |
| Media stream         | wss path returned by TwiML `<Connect><Stream>`|
| Inbound SMS          | `POST /webhooks/twilio/sms`                   |
| Outbound SMS         | `POST https://api.twilio.com/.../Messages`    |

Voice realtime architecture pairs Twilio Media Streams with Anthropic's
voice-capable model for low-latency speech. Sketched in `roadmap.md`; full
design lands in `docs/after-hours-agent.md` when we get there.

**Compliance.**
- All outbound SMS require explicit opt-in (`patients.consent_marketing`).
- Every outbound SMS includes "Reply STOP to opt out."
- "STOP" inbound → `opt_out` event → `closed_lost` state.

---

## Anthropic (LLM)

**Default models.**
- **ConciergeAgent**: `claude-sonnet-4-6` (cheap, fast, plenty of quality).
- **TriageAgent**: `claude-opus-4-7` (highest safety ceiling, used sparingly).

**Prompt caching.** Cache breakpoints at end of system prompt and end of
clinic block. Expected hit rate >85% in steady state.

**Cost model (rough, per clinic, per 10k DMs/month).**
- Without caching: ~$200/mo
- With caching: ~$25/mo

Order-of-magnitude estimate. Exact numbers depend on FAQ length and average
message turns; budget conservatively at $50/clinic/mo for v1.

**Abstraction.** All LLM calls go through `apps/api/services/llm.py`. To
swap providers, change one config line and one factory.

---

## OpenAI — not used in v1

Plan listed "OpenAI + Meta API." We're using Anthropic instead because (a)
prompt caching is more mature on Sonnet 4.6 at the time of writing, (b) the
team is in Claude Code so debugging is local, (c) tool use is reliable for
the structured output we need. The `LLM` interface accepts an OpenAI adapter
when/if we want to A/B providers.

---

## Calendly / GHL Calendars — booking

Phase 1 uses GHL's built-in calendar (free with the location). We send a
clinic-specific booking link in the bot reply and listen for the
`AppointmentCreate` GHL webhook to fire the `booking_confirmed` event.

Calendly is supported as a fallback if a clinic insists; same webhook
contract, different verifier.

---

## What's not integrated

- **EMR** (Nextech, Aesthetic Record, etc.) — Phase 3.
- **Reputation / review platforms** (BirdEye, Podium) — Phase 2 add for
  the `review_solicit` state.
- **Skincare e-comm** (Shopify, Big Commerce) — Phase 3 (revenue share).
- **Payments / consults pre-pay** — out of scope; clinics use existing tools.
