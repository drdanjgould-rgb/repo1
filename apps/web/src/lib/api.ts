/**
 * Server-side console API client. Reads CONSOLE_API_BASE_URL +
 * STAFF_API_TOKEN from the Next.js server env (NEVER expose either to
 * the browser). All console fetches go through here so we have one
 * place to add retries / auth refresh / etc later.
 */
const BASE = process.env.CONSOLE_API_BASE_URL ?? 'http://localhost:3000';
const TOKEN = process.env.STAFF_API_TOKEN ?? '';

export interface DashboardStats {
  conversationsToday: number;
  openEscalations: number;
  leadsByTier: { hot: number; warm: number; cold: number; blocked: number };
  asOf: string;
}

export interface EscalationRow {
  id: string;
  conversationId: string | null;
  reason: 'red_flag_medical' | 'human_handoff_request' | 'complaint' | 'compliance' | 'other';
  category: 'medical_emergency' | 'post_op_complication' | 'mental_health' | 'none';
  severity: number;
  rationale: string | null;
  notifiedAt: string | null;
  createdAt: string;
}

export interface ConversationSummary {
  id: string;
  platform: 'instagram' | 'tiktok' | 'sms' | 'voice' | 'web' | 'email';
  threadId: string;
  status: 'open' | 'closed' | 'escalated';
  lastMessageAt: string | null;
  createdAt: string;
}

export interface MessageRow {
  id: string;
  direction: 'inbound' | 'outbound';
  role: 'patient' | 'assistant' | 'staff' | 'system';
  contentRedacted: string;
  model: string | null;
  latencyMs: number | null;
  createdAt: string;
}

export interface LeadRow {
  id: string;
  source: string;
  score: number;
  tier: 'hot' | 'warm' | 'cold' | 'blocked';
  status: 'open' | 'contacted' | 'converted' | 'lost';
  procedureInterest: string | null;
  timeline: string | null;
  rawContactRedacted: string | null;
  createdAt: string;
  lastTouchedAt: string | null;
}

export type FetchResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function get<T>(path: string): Promise<FetchResult<T>> {
  if (!TOKEN) {
    return {
      ok: false,
      error:
        'STAFF_API_TOKEN is not set in the web app env. Set it in apps/web/.env.local — same value as the API server.',
    };
  }
  try {
    const res = await fetch(`${BASE}/api/v1${path}`, {
      headers: { authorization: `Bearer ${TOKEN}` },
      cache: 'no-store',
    });
    if (!res.ok) {
      return { ok: false, error: `${res.status} ${res.statusText}` };
    }
    return { ok: true, data: (await res.json()) as T };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export const consoleApi = {
  dashboard: () => get<DashboardStats>('/dashboard/stats'),
  escalations: () => get<{ items: EscalationRow[] }>('/escalations'),
  conversations: (status?: string) =>
    get<{ items: ConversationSummary[] }>(
      status ? `/conversations?status=${encodeURIComponent(status)}` : '/conversations',
    ),
  conversation: (id: string) =>
    get<{ conversation: ConversationSummary; messages: MessageRow[] }>(`/conversations/${id}`),
  leads: (tier?: string) =>
    get<{ items: LeadRow[] }>(tier ? `/leads?tier=${encodeURIComponent(tier)}` : '/leads'),
};
