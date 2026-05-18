# Roadmap

Phases mapped to the master-plan milestones. Each phase ends with a gate:
something measurable that must be true before the next phase starts.

---

## Phase 0 — Foundation (now → July 15, 2025)

**Goal.** Concierge MVP live in Dr. Gould's office. IG/TikTok DMs handled
end-to-end with GHL as the operator UI.

**Deliverables.**

- [x] Postgres schema (`migrations/0001_initial.sql`)
- [x] FastAPI skeleton with Meta webhook + Concierge agent
- [x] GHL one-way sync (contacts, notes, tags)
- [x] TriageAgent (regex + Opus 4.7 LLM check)
- [x] Lead scoring service
- [ ] Meta App Review submitted *(blocking — start week 1)*
- [ ] GHL location connected, custom fields created
- [ ] System prompt + clinic block written for Dr. Gould
- [ ] Safety evals: 50 messages, 100% red-flag recall
- [ ] Quality evals: 30 ideal DMs, ≥ 4/5 graded by Dr. Gould
- [ ] Soft launch: bot answers 100 DMs with Dr. Gould reviewing each before send
- [ ] Hard launch: autonomous reply with escalation

**Gate.** ≥ 60% lead-capture rate over 7 trailing days at Dr. Gould's office,
zero red-flag misses in evals, < 30s median first-reply latency.

---

## Phase 1 — Beta (Aug 1 → Sept 15, 2025)

**Goal.** 3 additional clinics live. After-Hours and Post-Op modules in
production.

**Deliverables.**

- [ ] Twilio Voice realtime agent (`docs/after-hours-agent.md`)
- [ ] Post-Op Recovery SMS sequence (`docs/post-op-recovery.md`)
- [ ] Multi-tenant onboarding flow: GHL OAuth, Meta page connect, FAQ ingest
- [ ] Per-clinic dashboards in GHL (custom field views)
- [ ] Internal admin UI (Next.js, read-only) for ContourAI staff
- [ ] HIPAA-tier hosting (BAA in place)
- [ ] Column-level PHI encryption
- [ ] PHI access audit table

**Gate.** 3 clinics autonomous for 7 days; no safety incidents; clinic NPS
collected per clinic owner.

---

## Phase 2 — Conference push (Sept 15 → Oct 10, 2025)

**Goal.** Demo-ready for AI Med Conference LA. Voice agent shines.

**Deliverables.**

- [ ] Live demo flow: scan QR → call number → talk to bot → see lead in dashboard
- [ ] Public landing page (contour.ai) with sample call recording
- [ ] Investor deck refresh (Mac)
- [ ] Press kit + 2-min demo video

**Gate.** 5+ booth-meeting MQLs from the conference.

---

## Phase 3 — Investor readiness (Oct → Jan 2026)

**Goal.** Octane MedTech Showcase, Newport. Investor narrative + product
maturity to support a seed round.

**Deliverables.**

- [ ] AI Growth Coach (pre-built flows other practices plug into)
- [ ] First version of in-house dashboard (replace GHL for clinics that want it)
- [ ] Per-clinic analytics: leads, conversion, response time, lead score trend
- [ ] EMR integration: first connector (likely Aesthetic Record or Nextech)
- [ ] Pricing & packaging finalized ($499 / $999 / $1999 tiers)
- [ ] Two case studies with hard numbers (Gould + 1 beta clinic)

**Gate.** $X ARR committed (price × LOIs) sufficient to back the seed deck.

---

## Phase 4 — Paid SaaS rollout (Q2 2026)

**Goal.** Move from beta-free to paying customers. Self-serve onboarding.

**Deliverables.**

- [ ] Self-serve signup → Meta + GHL OAuth → live in < 30 minutes
- [ ] Stripe billing on tiers
- [ ] In-product support (Intercom or homegrown)
- [ ] On-call rotation; status page
- [ ] Per-customer cost dashboard (LLM spend × clinic)

**Gate.** First 10 paying clinics ≥ 60 days retained.

---

## Phase 5 — Ecosystem (Q4 2026)

**Goal.** Revenue beyond SaaS. Skincare upsells, surgical supply partnerships,
done-for-you consulting offer.

**Deliverables.**

- [ ] E-commerce upsell module (Shopify connector, AI-driven recs in DM)
- [ ] Partner program (CRM resellers, GHL agencies)
- [ ] White-label option for surgical supply brands

**Gate.** Non-SaaS revenue ≥ 25% of MRR.

---

## Cross-cutting workstreams

These don't fit into one phase; they run continuously.

- **Safety & compliance.** Every new module ships with its own safety evals
  and a sign-off from Dr. Gould (clinical) + DJ (technical).
- **Cost guardrails.** Per-clinic LLM spend alarmed at $100/mo and $250/mo.
  Investigate before talking to the customer about pricing.
- **Eval coverage.** Every red-flag miss in production becomes a new eval
  case the next day. Same for tone complaints.
- **Founder-cadence.** Weekly 30-min review: top 3 production incidents, top
  3 customer asks, top 3 metrics. Owners: Daniel + DJ + Mac.
