import { createHash } from 'node:crypto';
import { redact } from '@contourai/phi-redact';
import type { ClaudeClient } from '@contourai/agents';
import type {
  ConversationsRepo,
  EscalationsRepo,
  LeadScoresRepo,
  LeadsRepo,
  MessagesRepo,
  PatientsRepo,
} from '@contourai/db/repos';
import type { ConversationPlatform } from '@contourai/db/schema';
import type { MailchimpClient, SheetsClient } from '@contourai/integrations';
import { containsBannedPhrase } from '@contourai/safety';
import type { ConciergeAgent } from '../agent.js';
import { HOLDING_REPLY } from '../agent.js';
import { classifyIntent, type Intent } from './intent.js';
import { scoreLead, type ScoreInput, type ScoringWeights } from './scoring.js';

/** What the channel adapter normalizes inbound DM payloads into. */
export interface InboundDMEvent {
  clinicId: string;
  platform: ConversationPlatform;
  threadId: string;
  /** Stable platform-side identifier; the key for inbound idempotency. */
  platformMsgId: string;
  /** Free-text patient message (raw — orchestrator redacts before persist). */
  text: string;
  /** Sender info — at least one of these so we can resolve / create a patient. */
  sender: {
    handle?: string;
    email?: string;
    phone?: string;
    displayName?: string;
  };
}

export interface OrchestratorDeps {
  client: ClaudeClient;
  agent: ConciergeAgent;
  repos: {
    conversations: ConversationsRepo;
    messages: MessagesRepo;
    escalations: EscalationsRepo;
    patients: PatientsRepo;
    leads: LeadsRepo;
    leadScores: LeadScoresRepo;
  };
  integrations: {
    mailchimp: MailchimpClient;
    sheets: SheetsClient;
  };
  clinic: {
    id: string;
    mailchimpListId: string;
    sheetsSpreadsheetId: string;
    sheetsRange: string;
    serviceAreaZips?: string[];
    scoringWeights?: Partial<ScoringWeights>;
  };
  /** Override for tests / replay. Defaults to `new Date()`. */
  now?: () => Date;
}

export type HandleResult =
  | {
      kind: 'escalated';
      conversationId: string;
      patientId: string;
      escalationId: string;
      category: string;
      severity: number;
      holdingReply: string;
    }
  | {
      kind: 'replied';
      conversationId: string;
      patientId: string;
      outboundMessageId: string;
      reply: string;
      intent: Intent;
      tier: 'hot' | 'warm' | 'cold' | 'blocked';
      score: number;
      mailchimpEnrolled: boolean;
      sheetsMirrored: boolean;
    }
  | {
      kind: 'silently_dropped';
      conversationId: string;
      reason: 'spam' | 'opt_out';
    }
  | {
      kind: 'failed_safely';
      conversationId: string | null;
      patientId: string | null;
      escalationId: string;
      reason: string;
      holdingReply: string;
    };

/**
 * The Concierge orchestrator. One inbound DM in, one durable, idempotent
 * pipeline out. See `workers/concierge/CLAUDE.md` and the master plan
 * for the high-level steps.
 *
 * Failure semantics:
 *   - Inbound persist is idempotent on `platformMsgId`.
 *   - Sheets + Mailchimp failures are logged but do NOT block the reply.
 *   - LLM failures end with a holding reply + escalation row (`failed_safely`).
 *   - Red-flag triage short-circuits to an `escalated` result.
 */
export async function handleInboundDM(
  deps: OrchestratorDeps,
  event: InboundDMEvent,
): Promise<HandleResult> {
  const now = deps.now ?? (() => new Date());

  // 1. Resolve or create patient
  const patient = await resolveOrCreatePatient(deps, event);

  // 2. Resolve or create conversation
  const conv = await resolveOrCreateConversation(deps, event, patient.id);

  // 3. Persist inbound (idempotent)
  const inboundRedacted = redact(event.text);
  await deps.repos.messages.insertIdempotent({
    conversationId: conv.id,
    clinicId: event.clinicId,
    direction: 'inbound',
    role: 'patient',
    contentRedacted: inboundRedacted.redacted,
    redactionMap: inboundRedacted.map,
    platformMsgId: event.platformMsgId,
    createdAt: now(),
  });
  await deps.repos.conversations.touch({ id: conv.id, at: now() });

  // 4. Safety triage runs BEFORE the LLM call. The agent itself enforces this;
  //    here we wrap so a red-flag emits the right escalation row.
  let reply;
  try {
    reply = await deps.agent.reply(event.text);
  } catch (e) {
    return await failSafely(deps, conv.id, patient.id, e, now);
  }

  if (reply.verdict.redFlag) {
    const esc = await deps.repos.escalations.insert({
      clinicId: event.clinicId,
      conversationId: conv.id,
      patientId: patient.id,
      reason: 'red_flag_medical',
      category: mapCategory(reply.verdict.category),
      severity: reply.verdict.severity,
      rationale: reply.verdict.rationale,
      createdAt: now(),
    });
    await deps.repos.conversations.setStatus({ id: conv.id, status: 'escalated' });
    await deps.repos.messages.insert({
      conversationId: conv.id,
      clinicId: event.clinicId,
      direction: 'outbound',
      role: 'system',
      contentRedacted: HOLDING_REPLY,
      createdAt: now(),
    });
    return {
      kind: 'escalated',
      conversationId: conv.id,
      patientId: patient.id,
      escalationId: esc.id,
      category: esc.category,
      severity: esc.severity,
      holdingReply: HOLDING_REPLY,
    };
  }

  // 5. Classify intent (Haiku) — separate small call alongside generation.
  let intent;
  try {
    intent = await classifyIntent(deps.client, event.text);
  } catch (e) {
    return await failSafely(deps, conv.id, patient.id, e, now);
  }

  // 6. Spam path: persist nothing else, no reply.
  if (intent.intent === 'spam') {
    return { kind: 'silently_dropped', conversationId: conv.id, reason: 'spam' };
  }

  // 7. Post-generation banned-phrase filter. If hit, swap in the holding
  //    reply + escalate so staff reviews.
  const outboundText = reply.text;
  const banned = containsBannedPhrase(outboundText);
  let finalReply = outboundText;
  if (banned) {
    const esc = await deps.repos.escalations.insert({
      clinicId: event.clinicId,
      conversationId: conv.id,
      patientId: patient.id,
      reason: 'compliance',
      category: 'none',
      severity: 3,
      rationale: `banned phrase in outbound: "${banned.phrase}"`,
      createdAt: now(),
    });
    finalReply = HOLDING_REPLY;
    await deps.repos.conversations.setStatus({ id: conv.id, status: 'escalated' });
    await deps.repos.messages.insert({
      conversationId: conv.id,
      clinicId: event.clinicId,
      direction: 'outbound',
      role: 'system',
      contentRedacted: finalReply,
      createdAt: now(),
    });
    return {
      kind: 'escalated',
      conversationId: conv.id,
      patientId: patient.id,
      escalationId: esc.id,
      category: 'none',
      severity: 3,
      holdingReply: finalReply,
    };
  }

  // 8. Score the lead (deterministic). LLM-suggested delta is omitted in
  //    this step's pipeline — we wire it once the agent emits a structured
  //    classifier alongside the reply (a follow-up refactor).
  const scoreInput: ScoreInput = {
    intent: intent.intent,
    procedure: intent.procedure,
    isLocalZip: false,
    mentionedTimeline:
      /\b(next\s+week|this\s+(month|year)|by\s+\w+|in\s+\d+\s+(weeks?|months?))\b/i.test(
        event.text,
      ),
    isRepeatEngagement:
      (await deps.repos.messages.countInboundSince({
        conversationId: conv.id,
        since: new Date(now().getTime() - 30 * 24 * 60 * 60 * 1000),
      })) >= 3,
    comparingSurgeons: /\bDr\.\s+\w+\b|\bcompared\b|\bvs\.?\b/i.test(event.text),
    isVagueReply: event.text.trim().split(/\s+/).length < 3,
    ...(deps.clinic.scoringWeights ? { weights: deps.clinic.scoringWeights } : {}),
  };
  const score = scoreLead(scoreInput);

  // 9. Upsert lead + write a lead_score history row
  let lead = await deps.repos.leads.findOpenByPatient({
    clinicId: event.clinicId,
    patientId: patient.id,
  });
  if (!lead) {
    lead = await deps.repos.leads.create({
      clinicId: event.clinicId,
      contactId: patient.id,
      source: `${event.platform}_dm`,
      score: score.score,
      tier: score.tier,
      procedureInterest: intent.procedure ?? null,
      createdAt: now(),
    });
  } else {
    await deps.repos.leads.updateScore({
      id: lead.id,
      score: score.score,
      tier: score.tier,
      ...(intent.procedure ? { procedureInterest: intent.procedure } : {}),
    });
  }
  await deps.repos.leadScores.insert({
    clinicId: event.clinicId,
    leadId: lead.id,
    score: score.score,
    reason: explainScore(score.contributions),
    scoredAt: now(),
  });

  // 10. Persist outbound message with the LLM metadata Sonnet returned.
  const outboundRedacted = redact(finalReply);
  const outboundRow = await deps.repos.messages.insert({
    conversationId: conv.id,
    clinicId: event.clinicId,
    direction: 'outbound',
    role: 'assistant',
    contentRedacted: outboundRedacted.redacted,
    redactionMap: outboundRedacted.map,
    model: 'claude-sonnet-4-6',
    ...(reply.usage
      ? {
          promptTokens: reply.usage.input_tokens,
          completionTokens: reply.usage.output_tokens,
        }
      : {}),
    ...(reply.latencyMs !== undefined ? { latencyMs: reply.latencyMs } : {}),
    createdAt: now(),
  });

  // 11. Mirror to Sheets (best-effort; do NOT block on failure).
  const sheetsResult = await deps.integrations.sheets.appendRow({
    spreadsheetId: deps.clinic.sheetsSpreadsheetId,
    range: deps.clinic.sheetsRange,
    values: [
      now().toISOString(),
      patient.id,
      event.platform,
      intent.intent,
      intent.procedure ?? '',
      score.score,
      score.tier,
    ],
  });

  // 12. Enroll in Mailchimp for warm/hot leads, if we have an email.
  let mailchimpEnrolled = false;
  if ((score.tier === 'hot' || score.tier === 'warm') && event.sender.email !== undefined) {
    const up = await deps.integrations.mailchimp.upsertMember({
      listId: deps.clinic.mailchimpListId,
      email: event.sender.email,
      ...(event.sender.displayName ? { firstName: event.sender.displayName.split(/\s+/)[0] } : {}),
    });
    if (up.ok) {
      await deps.integrations.mailchimp.addTags({
        listId: deps.clinic.mailchimpListId,
        email: event.sender.email,
        tags: [`contourai:${score.tier}_lead`, `contourai:intent_${intent.intent}`],
      });
      mailchimpEnrolled = true;
    }
  }

  return {
    kind: 'replied',
    conversationId: conv.id,
    patientId: patient.id,
    outboundMessageId: outboundRow.id,
    reply: finalReply,
    intent: intent.intent,
    tier: score.tier,
    score: score.score,
    mailchimpEnrolled,
    sheetsMirrored: sheetsResult.ok,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sha256(s: string): Uint8Array {
  return createHash('sha256').update(s).digest();
}

async function resolveOrCreatePatient(
  deps: OrchestratorDeps,
  event: InboundDMEvent,
): Promise<{ id: string }> {
  const { email, phone } = event.sender;
  if (email) {
    const hash = sha256(email.toLowerCase());
    const existing = await deps.repos.patients.findByEmailHash({
      clinicId: event.clinicId,
      emailHash: hash,
    });
    if (existing) return existing;
    return deps.repos.patients.create({
      clinicId: event.clinicId,
      emailHash: hash,
      ...(phone ? { phoneHash: sha256(phone) } : {}),
    });
  }
  if (phone) {
    const hash = sha256(phone);
    const existing = await deps.repos.patients.findByPhoneHash({
      clinicId: event.clinicId,
      phoneHash: hash,
    });
    if (existing) return existing;
    return deps.repos.patients.create({ clinicId: event.clinicId, phoneHash: hash });
  }
  // No deterministic key — create an anonymous patient keyed only on the platform handle.
  return deps.repos.patients.create({ clinicId: event.clinicId });
}

async function resolveOrCreateConversation(
  deps: OrchestratorDeps,
  event: InboundDMEvent,
  patientId: string,
): Promise<{ id: string }> {
  const found = await deps.repos.conversations.findByThread({
    clinicId: event.clinicId,
    platform: event.platform,
    threadId: event.threadId,
  });
  if (found) return found;
  return deps.repos.conversations.create({
    clinicId: event.clinicId,
    platform: event.platform,
    threadId: event.threadId,
    contactId: patientId,
  });
}

async function failSafely(
  deps: OrchestratorDeps,
  conversationId: string,
  patientId: string,
  err: unknown,
  now: () => Date,
): Promise<HandleResult> {
  const reason = err instanceof Error ? err.message : String(err);
  const esc = await deps.repos.escalations.insert({
    clinicId: deps.clinic.id,
    conversationId,
    patientId,
    reason: 'other',
    category: 'none',
    severity: 3,
    rationale: `agent failure: ${reason}`,
    createdAt: now(),
  });
  await deps.repos.conversations.setStatus({ id: conversationId, status: 'escalated' });
  await deps.repos.messages.insert({
    conversationId,
    clinicId: deps.clinic.id,
    direction: 'outbound',
    role: 'system',
    contentRedacted: HOLDING_REPLY,
    createdAt: now(),
  });
  return {
    kind: 'failed_safely',
    conversationId,
    patientId,
    escalationId: esc.id,
    reason,
    holdingReply: HOLDING_REPLY,
  };
}

function mapCategory(
  c: string,
): 'medical_emergency' | 'post_op_complication' | 'mental_health' | 'none' {
  if (
    c === 'medical_emergency' ||
    c === 'post_op_complication' ||
    c === 'mental_health' ||
    c === 'none'
  ) {
    return c;
  }
  return 'none';
}

function explainScore(contributions: Record<string, number>): string {
  const parts = Object.entries(contributions).map(([k, v]) => `${k}=${v >= 0 ? '+' : ''}${v}`);
  return parts.length > 0 ? parts.join(', ') : 'no signals';
}
