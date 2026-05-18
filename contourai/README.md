# ContourAI

> The AI Operating System for Aesthetic Practices.
> Built by a plastic surgeon. Scaled by startup veterans. Automated by AI.

ContourAI is a modular AI platform that replaces front- and mid-office staff
across aesthetic / surgical practices. This directory holds the **technical
design and the MVP scaffold** for the system described in the master execution
plan.

## What's in this directory

```
contourai/
  README.md                  ← you are here
  docs/
    architecture.md          ← system overview, components, data flow
    patient-journey.md       ← state machine spec (the universal foundation)
    data-model.md            ← Postgres schema & rationale
    ai-concierge.md          ← deep design for the IG/TikTok DM concierge
    integrations.md          ← Meta, GHL, Twilio, Anthropic contracts
    roadmap.md               ← phases mapped to master-plan milestones
  apps/api/                  ← FastAPI backend (concierge MVP)
  migrations/                ← Postgres DDL
  tests/                     ← pytest suite
  docker-compose.yml         ← local dev stack
  pyproject.toml             ← Python deps
  .env.example               ← required env vars
```

## How the scaffold maps to the master plan

| Plan module             | Phase 1 build target          | Status in this scaffold |
|-------------------------|-------------------------------|-------------------------|
| AI Concierge            | IG/TikTok DM → CRM            | **Scaffolded** ✅       |
| After-Hours Agent       | Twilio Voice/SMS              | Designed, not built     |
| Post-Op Recovery        | SMS sequence + triage         | Designed, not built     |
| AI Lead Engine          | Reuses concierge primitives   | Designed                |
| Dashboard               | GHL (Phase 1) → custom (SaaS) | GHL sync only           |

The scaffold is **opinionated**: every module reuses the same `Patient`,
`Conversation`, `Message`, `Lead`, and `Escalation` primitives, so we don't end
up with five copies of the same code when the After-Hours and Post-Op modules
land.

## Quick start

```bash
cd contourai
cp .env.example .env          # fill in keys
docker-compose up -d db       # Postgres on :5432
pip install -e .
psql $DATABASE_URL -f migrations/0001_initial.sql
uvicorn apps.api.main:app --reload --port 8000
```

Then point a Meta webhook at `https://<your-tunnel>/webhooks/meta` (see
`docs/integrations.md` for the ngrok dance).

## Read order for new contributors

1. `docs/architecture.md` — what the boxes are
2. `docs/patient-journey.md` — what state every patient is in, always
3. `docs/data-model.md` — what's in Postgres
4. `docs/ai-concierge.md` — how the first module actually works
5. `docs/integrations.md` — external contracts
6. `docs/roadmap.md` — what's next and when
