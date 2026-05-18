# ContourAI

> The AI Operating System for Aesthetic Practices.
> Built by a plastic surgeon. Scaled by startup veterans. Automated by AI.

ContourAI is a modular AI platform that replaces front- and mid-office staff
across aesthetic surgery practices: lead capture, patient education,
scheduling, post-op follow-up, and after-hours coverage across Instagram,
TikTok, SMS, voice, and web.

The MVP runs first inside **Gould Plastic Surgery** (Beverly Hills) as the
proof-of-concept site, then rolls to a small beta cohort of clinics, then
becomes a paid SaaS.

## Modules (built in order)

| #   | Module                                             | State         |
| --- | -------------------------------------------------- | ------------- |
| 1   | **AI Concierge** — IG/TikTok/web DM responder      | Current build |
| 2   | After-Hours Voice and SMS Agent (Twilio)           | Next          |
| 3   | Post-Op Recovery Agent (Day 1–14, red-flag triage) | Designed      |
| 4   | Clinic Dashboard (leads, conversations, alerts)    | Designed      |
| 5   | Reactivation Agent (long-tail re-engagement)       | Designed      |

We do not scaffold thin stubs for all five at once. Each module ships an
end-to-end working slice before the next one starts.

## Repository layout

```
contourai/
├── apps/
│   ├── dashboard/          # Next.js — clinic staff UI (Module 4)
│   ├── patient-web/        # Next.js — patient-facing chat + forms (deferred)
│   └── api/                # Hono — webhook + REST surface
├── workers/
│   ├── concierge/          # IG/TikTok/web DM agent       ← Module 1 (now)
│   ├── after-hours/        # Twilio voice + SMS agent
│   ├── post-op/            # Recovery sequence agent
│   └── reactivation/       # Long-tail re-engagement
├── packages/
│   ├── agents/             # Agent primitives, prompt registry, Claude client
│   ├── safety/             # Red-flag detection (shared across all modules)
│   ├── knowledge/          # Clinic content (procedure pages, FAQ)
│   ├── evals/              # Eval harness + fixtures (cross-module)
│   ├── db/                 # Drizzle schema + migrations + seed
│   ├── phi-redact/         # PHI detection + redaction layer
│   ├── integrations/       # Typed clients: Meta, TikTok, Twilio, Resend
│   ├── ui/                 # Shared React components (deferred)
│   └── config/             # Env, feature flags, shared types
└── infra/
    └── (terraform or sst — TBD when first prod deploy lands)
```

## Tech stack

- **Language.** TypeScript end-to-end. Strict mode. No `any` without an inline
  justification comment.
- **Monorepo.** pnpm workspaces + Turborepo.
- **Frontend.** Next.js (App Router) for dashboard.
- **Backend / workers.** Node 20. Hono for the API surface. Inngest for agent
  workflows, scheduled sequences, and webhook fan-out.
- **LLM provider.** Anthropic Claude — **Sonnet 4.6** for generation,
  **Haiku 4.5** for intent classification, **Opus 4.7** for the safety
  classifier (red-flag / medical-escalation detection). OpenAI as a
  feature-flagged fallback.
- **Database.** Postgres on Supabase. Drizzle ORM is the migration source
  of truth. RLS enabled from day one with `clinic_id` isolation.
- **Voice / SMS.** Twilio.
- **Messaging APIs.** Meta Graph API (Instagram, WhatsApp), TikTok Business API.
- **Email.** Resend (transactional). Mailchimp (sequences, v1 only;
  in-house sequencer in v2).
- **Observability.** Pino structured logs → Axiom. PostHog for product
  analytics.
- **Auth.** Supabase Auth for clinic staff. Magic links for patients.
- **Hosting.** Vercel (`apps/*`). Fly.io (`workers/*`).

## Security and compliance posture

- **HIPAA BAA with Anthropic** is in flight (see `docs/baa-anthropic-outreach.md`).
- Until executed, **no PHI to third-party LLMs.** The `packages/phi-redact`
  layer runs before every external LLM call.
- Audit log writes for every patient-facing message, every staff action,
  every webhook received — implemented via Postgres triggers, not application
  code, to be unbypassable.
- RLS on Supabase from day one; cross-clinic reads impossible at the DB layer.
- Secrets in `.env.local` (gitignored). Production secrets in encrypted
  Vercel and Fly environments.

## Constraints — not negotiable

- **No invented clinical claims.** If the knowledge base doesn't cover a
  question, the agent escalates to staff queue with a holding message.
- **No prices over DM.** See `packages/knowledge/pricing_policy.md`.
- **Every outbound message is logged** with prompt, completion, model,
  latency, and redaction map.
- **Banned phrases** (e.g., "transformation," "reset," "anti-aging," "best
  version of yourself," "journey," "rejuvenate" as a standalone claim) are
  enforced in three layers: the system prompt, the eval banned-phrase scan,
  and a post-generation regex filter before send.
- **Safety eval gate.** No module wires to live webhooks until its eval
  suite passes including 100% red-flag recall.

## Voice and tone

Warm, precise, surgeon-trained. The tone is that of a senior RN trained by
Dr. Gould. Avoid marketing language. Anatomically precise; structural
reasoning preferred over aesthetic adjectives.

## Local development

```bash
nvm use                  # node 20
pnpm install
pnpm dev                 # Turborepo dev across all packages
```

Per-module dev loops are scaffolded as each module lands. The Concierge
local simulator lives at `workers/concierge` and runs without hitting Meta
or TikTok APIs.

## Working in this repo

See `CLAUDE.md` for engineering conventions (TS strict, error handling,
logging, PHI rules, testing, commits).

## Note on the `contourai/` subdirectory

A Python scaffold from an earlier design exploration lives at `./contourai/`
(FastAPI + SQLAlchemy). **It is not part of the active codebase**; the
canonical implementation is the TypeScript monorepo described above.
Keeping the Python design docs around for reference; the runnable code
there is superseded.
