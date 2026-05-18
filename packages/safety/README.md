# @contourai/safety

Red-flag detection. Runs on every inbound message in every module
(Concierge, After-Hours, Post-Op, Reactivation). When a red flag fires,
the agent loop short-circuits the normal response, sends a holding
message, and escalates to staff with a clinic alert.

## API

```ts
import { quickTriage, type SafetyVerdict } from '@contourai/safety';

const verdict: SafetyVerdict = quickTriage(message, { postOp });
if (verdict.redFlag) {
  // escalate; do NOT generate a normal reply
}
```

## Two-tier design

| Layer                                           | Runs                          | Model           | Use                                  |
| ----------------------------------------------- | ----------------------------- | --------------- | ------------------------------------ |
| `quickTriage` (this package)                    | Always, sync, ~0ms            | Regex           | Catches the easy 90%                 |
| `SafetyClassifier` (lands in `packages/agents`) | When regex hits, async, ~1-2s | Claude Opus 4.7 | Disambiguates hypotheticals + quotes |

The regex layer is intentionally over-flagging. A patient saying "my friend
had bleeding once" matches `bleeding` here, escalates to the LLM, which
downgrades it. The LLM cannot upgrade a no-match to a match.

For Module 1 (Concierge) v1, the regex layer alone is sufficient until the
LLM ceiling lands. Operator review for false-positive escalations
is the gap-filler in the meantime.

## Categories

| Category               | Examples                                                |
| ---------------------- | ------------------------------------------------------- |
| `medical_emergency`    | chest pain, can't breathe, fainted, slurred speech, 911 |
| `post_op_complication` | bleeding, pus, dehiscence, sepsis, drain failure        |
| `mental_health`        | suicidal ideation, self-harm, "want to die"             |
| `none`                 | no match                                                |

## Severity

1–5. Used to route alerts (sev 5 = immediate page; sev 3 = staff queue with
1-hour SLA). When `postOp: true`, matched severity gets a +1 bump (capped
at 5) because symptoms that are normal context become urgent post-surgery.

## Built-in patterns

~22 patterns in `src/patterns.ts`. Covers cardiac, respiratory, bleeding,
neuro (dizzy/numb/vision/speech), mental-health, emergency context (911 /
ER / ambulance), infection (fever + temp, pus, dehiscence, sepsis),
allergic reactions, and post-op-specific concerns (drain failure,
asymmetric swelling).

## Clinic extension

```ts
quickTriage(text, {
  postOp: true,
  additionalRedFlags: [
    {
      pattern: /\bimplant\s+(?:weird|moving|shifting)\b/,
      category: 'post_op_complication',
      severity: 3,
    },
  ],
});
```

Custom patterns are tagged `custom_<index>` in the verdict.

## Tests

`pnpm --filter @contourai/safety test` — 35 tests across positive cases,
false-positive guards, verdict shape, postOp behavior, and custom patterns.

## What's deliberately deferred

- The Opus 4.7 LLM ceiling — lands in `packages/agents` along with the
  Claude client wrapper. Until then `quickTriage` is the only triage and
  staff handle the false-positive load.
- Voice-specific patterns (caller distress signals, audible breathing
  difficulty) — the After-Hours module owns voice-time signals; lands with
  Module 2.
- Multi-language detection — English only in v1.
