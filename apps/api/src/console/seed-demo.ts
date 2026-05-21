/**
 * Demo seed for the staff console.
 *
 *   pnpm seed:demo
 *
 * Inserts a realistic-looking set of conversations + messages + escalations
 * + leads so the `/api/v1/*` console returns interesting data even when no
 * live webhooks have fired. Idempotent on (platform, thread_id).
 *
 * Requires DATABASE_URL + DEFAULT_CLINIC_ID in env (use .env.local). The
 * clinic must already exist — run `pnpm --filter @contourai/db db:seed`
 * first.
 *
 * SAFETY: this writes synthetic data only. Names, phones, and emails are
 * fabricated. Never run against a production DB.
 */
import 'dotenv/config';
import { createClient } from '@contourai/db/client';
import {
  drizzleConversationsRepo,
  drizzleEscalationsRepo,
  drizzleLeadsRepo,
  drizzleMessagesRepo,
} from '@contourai/db/repos';

interface SeedScenario {
  thread: string;
  platform: 'instagram' | 'sms' | 'web';
  status: 'open' | 'closed' | 'escalated';
  ageHours: number;
  turns: Array<{ direction: 'inbound' | 'outbound'; role: 'patient' | 'assistant'; text: string }>;
  escalation?: {
    reason: 'red_flag_medical' | 'compliance' | 'human_handoff_request' | 'other';
    category: 'medical_emergency' | 'post_op_complication' | 'mental_health' | 'none';
    severity: 1 | 2 | 3 | 4 | 5;
    rationale: string;
  };
  lead?: {
    tier: 'hot' | 'warm' | 'cold' | 'blocked';
    score: number;
    procedure?: string;
    timeline?: string;
    contactRedacted?: string;
  };
}

const SCENARIOS: SeedScenario[] = [
  {
    thread: 'demo-ig-001',
    platform: 'instagram',
    status: 'open',
    ageHours: 0.5,
    turns: [
      {
        direction: 'inbound',
        role: 'patient',
        text: 'Hi, how much does a deep plane facelift cost?',
      },
      {
        direction: 'outbound',
        role: 'assistant',
        text: 'Pricing depends on the specifics of your case. The deep plane facelift is highly individualized — happy to schedule a consult where Dr. Gould reviews your anatomy and gives you a tailored plan. What is the best way to reach you?',
      },
      {
        direction: 'inbound',
        role: 'patient',
        text: 'You can email me at <<PHI_EMAIL_001>>',
      },
    ],
    lead: {
      tier: 'warm',
      score: 55,
      procedure: 'deep plane facelift',
      contactRedacted: '<<PHI_EMAIL_001>>',
    },
  },
  {
    thread: 'demo-ig-002',
    platform: 'instagram',
    status: 'escalated',
    ageHours: 1.2,
    turns: [
      {
        direction: 'inbound',
        role: 'patient',
        text: 'I am bleeding through the dressing right now what do I do',
      },
    ],
    escalation: {
      reason: 'red_flag_medical',
      category: 'post_op_complication',
      severity: 5,
      rationale: 'patient reports active bleeding through dressing — immediate medical concern',
    },
  },
  {
    thread: 'demo-ig-003',
    platform: 'instagram',
    status: 'open',
    ageHours: 4,
    turns: [
      {
        direction: 'inbound',
        role: 'patient',
        text: 'I had a facelift somewhere else a year ago and I am really unhappy. Can Dr. Gould fix this?',
      },
      {
        direction: 'outbound',
        role: 'assistant',
        text: 'I am sorry to hear you are not happy with your result. The honest answer is that I cannot tell you what is possible without Dr. Gould seeing you. He performs revision deep plane work and the conversation always starts with anatomy. He will not promise an outcome over a DM and he will not speak to what another surgeon did. The next step is a consult. What is the best way to reach you?',
      },
    ],
    lead: {
      tier: 'hot',
      score: 75,
      procedure: 'revision facelift',
      contactRedacted: '<<PHI_PHONE_002>>',
    },
  },
  {
    thread: 'demo-ig-004',
    platform: 'instagram',
    status: 'open',
    ageHours: 6,
    turns: [
      {
        direction: 'inbound',
        role: 'patient',
        text: 'I am 4 months post tummy tuck and a little fluid build up under the skin is this normal',
      },
      {
        direction: 'outbound',
        role: 'assistant',
        text: 'Let me get a team member to follow up with you on this. Fluid questions are something we want a clinical eye on, not a quick answer over DM. Someone from the team will reach out shortly.',
      },
    ],
    escalation: {
      reason: 'human_handoff_request',
      category: 'post_op_complication',
      severity: 3,
      rationale: 'post-op fluid complaint — routed to clinical for assessment',
    },
  },
  {
    thread: 'demo-ig-005',
    platform: 'instagram',
    status: 'open',
    ageHours: 12,
    turns: [
      {
        direction: 'inbound',
        role: 'patient',
        text: 'Considering breast aug. Worried about BII. Should I be scared?',
      },
      {
        direction: 'outbound',
        role: 'assistant',
        text: 'Honest answer: about a third of patients sail through, about a third have manageable symptoms over time, about a third end up wishing they had chosen differently. Dr. Gould uses prepectoral ergonomic implants and walks every patient through the trade-offs — including fat transfer as an alternative. He would rather you choose the right thing than choose his thing. Want to schedule a consult?',
      },
    ],
    lead: {
      tier: 'warm',
      score: 50,
      procedure: 'breast augmentation',
    },
  },
  {
    thread: 'demo-ig-006',
    platform: 'instagram',
    status: 'open',
    ageHours: 22,
    turns: [
      {
        direction: 'inbound',
        role: 'patient',
        text: 'Do you guys do botox',
      },
      {
        direction: 'outbound',
        role: 'assistant',
        text: 'Yes — injectables are offered alongside the surgical practice. Pricing depends on units used; happy to capture your contact info and have the team follow up with specifics.',
      },
    ],
    lead: {
      tier: 'cold',
      score: 15,
    },
  },
  {
    thread: 'demo-ig-007',
    platform: 'instagram',
    status: 'closed',
    ageHours: 48,
    turns: [
      {
        direction: 'inbound',
        role: 'patient',
        text: 'thx for booking me, see you next week',
      },
    ],
    lead: {
      tier: 'hot',
      score: 85,
      procedure: 'deep plane facelift',
      timeline: 'booked',
    },
  },
  {
    thread: 'demo-ig-008',
    platform: 'instagram',
    status: 'escalated',
    ageHours: 30,
    turns: [
      {
        direction: 'inbound',
        role: 'patient',
        text: 'imagine the transformation you will feel after surgery',
      },
      {
        direction: 'outbound',
        role: 'assistant',
        text: 'Thanks for reaching out — the team will follow up shortly.',
      },
    ],
    escalation: {
      reason: 'compliance',
      category: 'none',
      severity: 2,
      rationale: 'outbound message tripped banned-phrase filter (transformation)',
    },
  },
];

async function main(): Promise<void> {
  const url = process.env['DATABASE_URL'];
  const clinicId = process.env['DEFAULT_CLINIC_ID'];
  if (!url) throw new Error('DATABASE_URL required (set in .env.local)');
  if (!clinicId) throw new Error('DEFAULT_CLINIC_ID required (set in .env.local)');

  const { db, close } = createClient({ url, max: 1 });
  const conversations = drizzleConversationsRepo(db);
  const messages = drizzleMessagesRepo(db);
  const escalations = drizzleEscalationsRepo(db);
  const leads = drizzleLeadsRepo(db);

  const now = new Date();
  let createdConvs = 0;
  let createdMsgs = 0;
  let createdEsc = 0;
  let createdLeads = 0;

  try {
    for (const s of SCENARIOS) {
      const existing = await conversations.findByThread({
        clinicId,
        platform: s.platform,
        threadId: s.thread,
      });
      if (existing) {
        process.stdout.write(`  · skip ${s.thread} (exists)\n`);
        continue;
      }
      const startedAt = new Date(now.getTime() - s.ageHours * 60 * 60 * 1000);
      const conv = await conversations.create({
        clinicId,
        platform: s.platform,
        threadId: s.thread,
        status: s.status,
        createdAt: startedAt,
        lastMessageAt: new Date(startedAt.getTime() + s.turns.length * 60_000),
      });
      createdConvs += 1;

      let lastMsgId: string | null = null;
      for (const [i, t] of s.turns.entries()) {
        const msg = await messages.insert({
          clinicId,
          conversationId: conv.id,
          direction: t.direction,
          role: t.role,
          contentRedacted: t.text,
          ...(t.direction === 'outbound'
            ? { model: 'claude-sonnet-4-6', latencyMs: 700 + ((i * 137) % 600) }
            : {}),
          createdAt: new Date(startedAt.getTime() + i * 60_000),
        });
        createdMsgs += 1;
        lastMsgId = msg.id;
      }

      if (s.escalation) {
        await escalations.insert({
          clinicId,
          conversationId: conv.id,
          messageId: lastMsgId,
          reason: s.escalation.reason,
          category: s.escalation.category,
          severity: s.escalation.severity,
          rationale: s.escalation.rationale,
          createdAt: new Date(startedAt.getTime() + s.turns.length * 60_000),
        });
        createdEsc += 1;
      }

      if (s.lead) {
        await leads.create({
          clinicId,
          source: s.platform,
          tier: s.lead.tier,
          score: s.lead.score,
          ...(s.lead.procedure ? { procedureInterest: s.lead.procedure } : {}),
          ...(s.lead.timeline ? { timeline: s.lead.timeline } : {}),
          ...(s.lead.contactRedacted ? { rawContactRedacted: s.lead.contactRedacted } : {}),
          createdAt: startedAt,
          lastTouchedAt: new Date(startedAt.getTime() + s.turns.length * 60_000),
        });
        createdLeads += 1;
      }
      process.stdout.write(`  + ${s.thread}\n`);
    }

    process.stdout.write(
      `\nSeed complete: ${createdConvs} convs, ${createdMsgs} msgs, ${createdEsc} escalations, ${createdLeads} leads.\n`,
    );
  } finally {
    await close();
  }
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`seed failed: ${msg}\n`);
  process.exit(1);
});
