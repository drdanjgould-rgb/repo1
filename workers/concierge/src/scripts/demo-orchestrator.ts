/**
 * Demo script — runs handleInboundDM against fakes for three canonical
 * scenarios so you can see exactly what each pipeline step does without
 * any real API keys or a database.
 *
 *   pnpm --filter @contourai/worker-concierge demo
 *   pnpm demo:orchestrator   # root alias
 */
import { ClaudeClient } from '@contourai/agents';
import { FakeTransport } from '@contourai/agents/test-utils';
import {
  FakeConversationsRepo,
  FakeEscalationsRepo,
  FakeLeadScoresRepo,
  FakeLeadsRepo,
  FakeMessagesRepo,
  FakePatientsRepo,
} from '@contourai/db/test-utils';
import {
  FakeMailchimpClient,
  FakeMetaClient,
  FakeSheetsClient,
} from '@contourai/integrations/test-utils';
import { createConciergeAgent } from '../agent.js';
import {
  handleInboundDM,
  type InboundDMEvent,
  type OrchestratorDeps,
} from '../handlers/handle-inbound-dm.js';

const CLINIC_ID = '00000000-0000-0000-0000-000000000001';

function divider(title: string): void {
  process.stdout.write(`\n${'═'.repeat(72)}\n  ${title}\n${'═'.repeat(72)}\n`);
}

function bullet(label: string, value: string | number | boolean): void {
  process.stdout.write(`  • ${label}: ${String(value)}\n`);
}

function buildDeps(scenario: 'happy' | 'red_flag' | 'spam'): {
  deps: OrchestratorDeps;
  conversations: FakeConversationsRepo;
  messages: FakeMessagesRepo;
  escalations: FakeEscalationsRepo;
  patients: FakePatientsRepo;
  leads: FakeLeadsRepo;
  leadScores: FakeLeadScoresRepo;
  mailchimp: FakeMailchimpClient;
  sheets: FakeSheetsClient;
  meta: FakeMetaClient;
} {
  // Script LLM responses so the demo is deterministic.
  // - The agent's reply call (Sonnet, generates patient-facing text).
  // - The intent classifier call (Haiku, tool use).
  const generationReply = {
    happy:
      'Hi there! Pricing depends on the specifics of each patient — Dr. Gould reviews each case at consultation. What is the best way to reach you, phone or email?',
    red_flag: '(unused — safety triage short-circuits before the LLM)',
    spam: "Thanks for reaching out. I'm an assistant for Gould Plastic Surgery — happy to help if you have questions about our services.",
  }[scenario];

  const intentToolInput = {
    happy: {
      intent: 'pricing',
      urgency: 3,
      asked_for_human: false,
      procedure: 'deep plane facelift',
    },
    red_flag: { intent: 'post_op', urgency: 5, asked_for_human: false },
    spam: { intent: 'spam', urgency: 1, asked_for_human: false },
  }[scenario];

  // For red_flag, no LLM calls happen (safety short-circuits). For others,
  // two calls: generation (Sonnet) then intent classification (Haiku).
  const transport =
    scenario === 'red_flag'
      ? FakeTransport.from()
      : FakeTransport.from(
          { content: [{ type: 'text', text: generationReply }] },
          {
            content: [{ type: 'tool_use', id: 'tu_1', name: 'classify', input: intentToolInput }],
            stop_reason: 'tool_use',
          },
        );

  const client = new ClaudeClient({ transport, defaultModule: 'demo' });
  const agent = createConciergeAgent({ client });

  const conversations = new FakeConversationsRepo();
  const messages = new FakeMessagesRepo();
  const escalations = new FakeEscalationsRepo();
  const patients = new FakePatientsRepo();
  const leads = new FakeLeadsRepo();
  const leadScores = new FakeLeadScoresRepo();
  const mailchimp = new FakeMailchimpClient();
  const sheets = new FakeSheetsClient();
  const meta = new FakeMetaClient();

  const deps: OrchestratorDeps = {
    client,
    agent,
    repos: { conversations, messages, escalations, patients, leads, leadScores },
    integrations: { mailchimp, sheets, meta },
    clinic: {
      id: CLINIC_ID,
      mailchimpListId: 'list-gould-leads',
      sheetsSpreadsheetId: 'sheet-gould-leads',
      sheetsRange: 'Leads!A1',
    },
  };

  return {
    deps,
    conversations,
    messages,
    escalations,
    patients,
    leads,
    leadScores,
    mailchimp,
    sheets,
    meta,
  };
}

async function runScenario(
  title: string,
  scenario: 'happy' | 'red_flag' | 'spam',
  event: InboundDMEvent,
): Promise<void> {
  divider(title);
  process.stdout.write(`  Inbound: "${event.text}"\n`);
  if (event.sender.email) bullet('  sender.email', event.sender.email);
  if (event.sender.phone) bullet('  sender.phone', event.sender.phone);

  const ctx = buildDeps(scenario);
  const result = await handleInboundDM(ctx.deps, event);

  process.stdout.write('\n  Pipeline outcome:\n');
  bullet('kind', result.kind);
  if (result.kind === 'replied') {
    bullet('intent', result.intent);
    bullet('tier', result.tier);
    bullet('score', result.score);
    bullet('reply', result.reply);
    bullet('mailchimp_enrolled', result.mailchimpEnrolled);
    bullet('sheets_mirrored', result.sheetsMirrored);
  } else if (result.kind === 'escalated') {
    bullet('category', result.category);
    bullet('severity', result.severity);
    bullet('holding_reply', result.holdingReply);
  } else if (result.kind === 'silently_dropped') {
    bullet('reason', result.reason);
  } else {
    bullet('reason', result.reason);
  }

  process.stdout.write('\n  Database side-effects (fakes):\n');
  bullet('patients_created', ctx.patients.byId.size);
  bullet('conversations_created', ctx.conversations.byId.size);
  bullet('messages_persisted', ctx.messages.rows.length);
  bullet('escalations_inserted', ctx.escalations.rows.length);
  bullet('leads_created', ctx.leads.byId.size);
  bullet('lead_scores_recorded', ctx.leadScores.rows.length);

  process.stdout.write('\n  Integrations:\n');
  bullet('sheets_appendRow_calls', ctx.sheets.calls.length);
  bullet('mailchimp_upsert_calls', ctx.mailchimp.upsertCalls.length);
  bullet('mailchimp_tag_calls', ctx.mailchimp.tagCalls.length);
  bullet('meta_send_calls', ctx.meta.sends.length);

  if (ctx.messages.rows.length > 0) {
    process.stdout.write('\n  Messages table contents:\n');
    for (const m of ctx.messages.rows) {
      process.stdout.write(
        `    [${m.direction.padEnd(8)} ${m.role.padEnd(9)}] ${m.contentRedacted.slice(0, 70)}${m.contentRedacted.length > 70 ? '…' : ''}\n`,
      );
    }
  }
  if (ctx.escalations.rows.length > 0) {
    process.stdout.write('\n  Escalations table contents:\n');
    for (const e of ctx.escalations.rows) {
      process.stdout.write(`    [${e.reason} sev=${e.severity}] ${e.rationale ?? ''}\n`);
    }
  }
}

async function main(): Promise<void> {
  process.stdout.write(
    '\nContourAI Concierge orchestrator demo\n' +
      'Runs handleInboundDM against in-memory fakes for three canonical\n' +
      'scenarios. No external API calls; no DB connection required.\n',
  );

  await runScenario('Scenario 1 — Happy path: pricing question from a warm lead', 'happy', {
    clinicId: CLINIC_ID,
    platform: 'instagram',
    threadId: 'ig-thread-sarah',
    platformMsgId: 'ig-msg-001',
    recipientPlatformId: 'ig-page-001',
    text: 'Hi, how much does a deep plane facelift cost with Dr. Gould? I am in LA and looking to schedule something in the next 2 months.',
    sender: {
      handle: '@sarah_j',
      email: 'sarah@example.com',
      displayName: 'Sarah Johnson',
    },
  });

  await runScenario('Scenario 2 — Red flag: active post-op symptom (must escalate)', 'red_flag', {
    clinicId: CLINIC_ID,
    platform: 'instagram',
    threadId: 'ig-thread-marie',
    platformMsgId: 'ig-msg-002',
    recipientPlatformId: 'ig-page-001',
    text: 'I am 5 days post tummy tuck and there is a lot of bleeding through my dressing right now. Should I be worried?',
    sender: {
      handle: '@marie_t',
      phone: '+15551234567',
      displayName: 'Marie Torres',
    },
  });

  await runScenario('Scenario 3 — Spam: must silently drop, no lead, no reply sent', 'spam', {
    clinicId: CLINIC_ID,
    platform: 'instagram',
    threadId: 'ig-thread-spam',
    platformMsgId: 'ig-msg-003',
    recipientPlatformId: 'ig-page-001',
    text: '🔥 BUY CRYPTO NOW VISIT BITLY LINK FOR FREE BITCOIN 🔥',
    sender: { handle: '@spammer123' },
  });

  process.stdout.write('\nDemo complete.\n\n');
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`fatal: ${msg}\n`);
  process.exit(1);
});
