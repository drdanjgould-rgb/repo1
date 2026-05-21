import { and, count, desc, eq, gte } from 'drizzle-orm';
import type { Database } from '../client.js';
import { leads } from '../schema/leads.js';
import type { Lead, LeadTier, NewLead } from '../schema/leads.js';

export interface LeadsRepo {
  /** Open (status='open') lead for a patient, most recent first. */
  findOpenByPatient(args: { clinicId: string; patientId: string }): Promise<Lead | null>;
  create(args: NewLead): Promise<Lead>;
  /** Update score/tier and bump last_touched_at. */
  updateScore(args: {
    id: string;
    score: number;
    tier: Lead['tier'];
    procedureInterest?: string;
    timeline?: string;
    rawContactRedacted?: string;
  }): Promise<void>;
  setStatus(args: { id: string; status: Lead['status'] }): Promise<void>;
  /** All leads for a clinic, newest first (staff console). */
  listRecent(args: { clinicId: string; limit: number; tier?: LeadTier }): Promise<Lead[]>;
  /** Counts grouped by tier for leads created on/after `since`. */
  countByTierSince(args: { clinicId: string; since: Date }): Promise<Record<LeadTier, number>>;
}

export function drizzleLeadsRepo(db: Database): LeadsRepo {
  return {
    async findOpenByPatient({ clinicId, patientId }) {
      const rows = await db
        .select()
        .from(leads)
        .where(
          and(
            eq(leads.clinicId, clinicId),
            eq(leads.contactId, patientId),
            eq(leads.status, 'open'),
          ),
        )
        .orderBy(desc(leads.createdAt))
        .limit(1);
      return rows[0] ?? null;
    },

    async create(args) {
      const rows = await db.insert(leads).values(args).returning();
      const row = rows[0];
      if (!row) throw new Error('insert returned no row');
      return row;
    },

    async updateScore({ id, score, tier, procedureInterest, timeline, rawContactRedacted }) {
      const patch: Partial<Lead> = { score, tier, lastTouchedAt: new Date() };
      if (procedureInterest !== undefined) patch.procedureInterest = procedureInterest;
      if (timeline !== undefined) patch.timeline = timeline;
      if (rawContactRedacted !== undefined) patch.rawContactRedacted = rawContactRedacted;
      await db.update(leads).set(patch).where(eq(leads.id, id));
    },

    async setStatus({ id, status }) {
      await db.update(leads).set({ status, lastTouchedAt: new Date() }).where(eq(leads.id, id));
    },

    async listRecent({ clinicId, limit, tier }) {
      const where = tier
        ? and(eq(leads.clinicId, clinicId), eq(leads.tier, tier))
        : eq(leads.clinicId, clinicId);
      return db
        .select()
        .from(leads)
        .where(where)
        .orderBy(desc(leads.lastTouchedAt), desc(leads.createdAt))
        .limit(limit);
    },

    async countByTierSince({ clinicId, since }) {
      const rows = await db
        .select({ tier: leads.tier, n: count() })
        .from(leads)
        .where(and(eq(leads.clinicId, clinicId), gte(leads.createdAt, since)))
        .groupBy(leads.tier);
      const out: Record<LeadTier, number> = { hot: 0, warm: 0, cold: 0, blocked: 0 };
      for (const r of rows) out[r.tier] = r.n;
      return out;
    },
  };
}
