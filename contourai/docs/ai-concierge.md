# AI Concierge — Deep Design

The Concierge is the first module. It handles inbound DMs from Instagram and
TikTok and (later) web chat. Its job is to **respond like a top-tier
patient coordinator** while doing the boring work: capturing contact info,
scoring the lead, syncing to GHL, and routing red flags to humans.

## What "good" looks like

Three concrete acceptance criteria for v1:

1. **Time to first reply < 30 seconds** for 95% of inbound DMs during US
   business hours.
2. **Lead capture rate ≥ 60%** (% of conversations that yield name + phone or
   email within 5 messages) — measured on Dr. Gould's account, baseline TBD.
3. **Zero red-flag misses** in evals. A message containing any of the
   safety-list phrases (`bleeding`, `dizzy`, `chest pain`, `emergency`,
   `suicidal`, etc.) must trigger an escalation 100% of the time, even if the
   word appears in a quote or hypothetical.

## Pipeline

```
                       Meta webhook POST /webhooks/meta
                                    │
                          ┌─────────▼─────────┐
                          │ verify signature  │
                          │ ack 200 < 10s     │
                          └─────────┬─────────┘
                                    │ enqueue BackgroundTask
                                    ▼
                          ┌───────────────────┐
                          │ normalize payload │
                          │ → InboundMessage  │
                          └─────────┬─────────┘
                                    ▼
                          ┌───────────────────┐
                          │ resolve patient   │
                          │ (handle lookup    │
                          │  or create)       │
                          └─────────┬─────────┘
                                    ▼
                          ┌───────────────────┐
                          │ persist message   │  (idempotent on platform_msg_id)
                          └─────────┬─────────┘
                                    ▼
                          ┌───────────────────┐
                          │ TriageAgent       │  ← SAFETY FIRST
                          │ red flag?         │
                          └─────────┬─────────┘
                                    │
                  ┌─────────────────┴─────────────────┐
                  │ yes                            no │
                  ▼                                   ▼
       ┌──────────────────┐               ┌──────────────────┐
       │ escalate         │               │ ConciergeAgent   │
       │ holding reply    │               │ classify + reply │
       │ alert clinic     │               └─────────┬────────┘
       └──────────────────┘                         │
                                                    ▼
                                         ┌──────────────────┐
                                         │ score lead       │
                                         │ advance state    │
                                         └─────────┬────────┘
                                                   ▼
                                         ┌──────────────────┐
                                         │ Meta send reply  │
                                         └─────────┬────────┘
                                                   ▼
                                         ┌──────────────────┐
                                         │ GHL sync         │
                                         │ (background)     │
                                         └──────────────────┘
```

## Agents

### TriageAgent (safety classifier)

Runs **before** the response generator. Two-pass:

1. **Cheap regex pre-filter** against a clinic-tunable safety word list
   (`bleeding`, `dizzy`, `passed out`, `pus`, `fever > 101`, `suicide`,
   `chest pain`, `can't breathe`, `911`, …). Any hit → run pass 2.
   Regex alone is the floor, not the ceiling — it catches the easy 90% with
   ~0ms latency and zero LLM cost.
2. **LLM check** (Claude Opus 4.7 for ceiling safety) with a tool-use schema:

   ```json
   {
     "red_flag": true,
     "category": "medical_emergency" | "post_op_complication" | "mental_health" | "none",
     "severity": 1-5,
     "rationale": "short string"
   }
   ```

   System prompt explicitly enumerates examples and counter-examples to
   suppress false positives ("my friend had bleeding" should not escalate).

Why two passes: the regex catches everything cheap; the LLM catches the
phrasing the regex misses (e.g., "I feel like my chest is being squeezed").
Opus is justified here because false negatives are unacceptable; the cost is
~$0.01 per check at v1 volumes.

### ConciergeAgent (response generator)

Single LLM call (Claude Sonnet 4.6) using **tool use** to emit structured
output alongside the natural-language reply. The model is required to call
one tool:

```python
tool_schema = {
    "name": "send_reply",
    "description": "Send a reply to the patient and record classifier output.",
    "input_schema": {
        "type": "object",
        "required": ["reply_text", "intent", "lead_score_delta", "next_action"],
        "properties": {
            "reply_text": {
                "type": "string",
                "description": "What the bot will say. Warm, professional, brief."
            },
            "intent": {
                "type": "string",
                "enum": ["pricing", "booking", "education", "complaint",
                         "small_talk", "human_request", "opt_out", "other"]
            },
            "procedure": {"type": "string", "description": "Free-form (e.g. 'rhinoplasty')."},
            "lead_score_delta": {
                "type": "integer",
                "description": "Suggested change to lead score, -20 to +40."
            },
            "captured": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "email": {"type": "string"},
                    "phone": {"type": "string"},
                    "timeline": {"type": "string"},
                    "zip": {"type": "string"}
                }
            },
            "next_action": {
                "type": "string",
                "enum": ["send_pricing_resource", "send_booking_link",
                         "ask_followup", "nurture_drip", "wait", "handoff_human"]
            }
        }
    }
}
```

Single round trip = reply + structured update in one call. Cheaper and lower
latency than chaining a "classify then reply" pipeline.

### Why Anthropic tool use (vs. JSON mode / function calling)

- **Reliability** at structured output is well-tested on Sonnet 4.6.
- **Prompt caching** on the system prompt + clinic FAQ block cuts cost
  ~90% per call. At 10k DMs/clinic/month that's the difference between
  $200/mo and $20/mo in LLM spend.
- **Easy migration**: the same code maps cleanly to OpenAI function calling
  if we ever swap.

## Prompt structure (cacheable)

```
┌──────────────────────────────────────────────┐
│  System prompt        ← STATIC, cached       │
│  (concierge persona, rules, output contract) │
├──────────────────────────────────────────────┤
│  Clinic block         ← per-clinic, cached   │
│  (clinic name, services, pricing range,      │
│   booking link, FAQ, tone overrides)         │
├──────────────────────────────────────────────┤
│  Patient block        ← per-patient, NOT cached  │
│  (journey_state, lead score, captured fields,│
│   profile, last_seen_at)                     │
├──────────────────────────────────────────────┤
│  Conversation history ← growing, NOT cached  │
│  (last 20 messages, oldest first)            │
├──────────────────────────────────────────────┤
│  New message          ← the trigger          │
└──────────────────────────────────────────────┘
```

Cache breakpoints: end of system, end of clinic block. Patient and history
change per call so they live below the cache line.

## Lead scoring (deterministic, not LLM)

The LLM emits a `lead_score_delta` *suggestion*; the actual score is computed
by `apps/api/services/lead_scoring.py` from hard signals (phone provided,
booking link clicked, etc., per the weight table in `patient-journey.md`).
LLM delta is treated as a tiebreaker, capped at ±10 per message. We don't
let the model hallucinate a hot lead just because the patient was friendly.

## GHL sync (background)

After every conversation turn, a background task upserts to GHL:

- **Contact** — keyed on email/phone; sets name, tags, custom fields
  (`lead_score`, `journey_state`, `procedure`, `last_intent`).
- **Note** — appends the latest inbound + outbound exchange (truncated).
- **Tag operations** — add/remove tags so the clinic can build GHL workflows
  off our state (e.g., `contourai:hot_lead`, `contourai:post_op`).

Sync is fire-and-forget with retry; if GHL is down, we keep serving patients
and reconcile when it comes back.

## Failure modes & fallbacks

| Failure                       | Behavior                                       |
|-------------------------------|------------------------------------------------|
| LLM timeout (> 10s)           | Send canned "thanks, we'll be right with you" + escalate to staff queue |
| LLM returns invalid tool args | Retry once; on second failure → escalate       |
| Meta API send fails           | Retry 3× with backoff; on giveup → log + alert |
| Postgres down                 | Webhook still 200s (we'd lose the message); add to TODO for queue-backed durability |
| GHL down                      | Continue; sync worker retries indefinitely     |
| Red-flag classifier false neg | (Should be zero.) Mitigated by regex pre-filter and adversarial evals |

## Evals

`tests/test_concierge.py` ships the unit scaffold. Beyond unit, two eval
suites we need before going live in any clinic:

1. **Safety evals.** Curated set of ~50 messages: 25 true red flags, 25
   tricky non-flags. Must hit 100% recall on flags, < 10% false positive on
   non-flags. Run on every PR.
2. **Quality evals.** Curated set of ~30 "ideal" Dr. Gould DMs with
   gold-standard replies graded by a human (Dr. Gould or a senior MA).
   Score on tone, accuracy, contact-capture progress. Target: 4/5 average.

Both suites live in `evals/` (to be added).

## What's deliberately deferred

- **Voice (Twilio)** — designed in `integrations.md`, not wired up.
- **TikTok DMs** — same code path as Instagram (Meta owns both), just an
  additional channel adapter; lands once IG is stable for two weeks.
- **Image/video understanding in DMs** — patients sometimes send photos.
  Phase 1 acknowledges them ("thanks for sending — a team member will
  review and get back to you within the hour") and escalates. Vision
  is a Phase 2 add.
- **Multi-language** — English only in v1. Sonnet 4.6 handles ES well but we
  need a Spanish-fluent reviewer on the eval set before turning it on.
