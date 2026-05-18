import { and, desc, eq, isNull } from 'drizzle-orm';
import type { Database } from '../client.js';
import { escalations } from '../schema/escalations.js';
import type { Escalation, NewEscalation } from '../schema/escalations.js';

export interface EscalationsRepo {
  insert(args: NewEscalation): Promise<Escalation>;
  /** Open escalations for a clinic, newest first. Drives the staff queue UI. */
  listOpen(args: { clinicId: string; limit: number }): Promise<Escalation[]>;
  /** Mark resolved (with notes) — staff workflow. */
  resolve(args: { id: string; notes?: string }): Promise<void>;
  /** Stamp `notified_at` after an alert is delivered. */
  markNotified(args: { id: string; at: Date }): Promise<void>;
}

export function drizzleEscalationsRepo(db: Database): EscalationsRepo {
  return {
    async insert(args) {
      const rows = await db.insert(escalations).values(args).returning();
      const row = rows[0];
      if (!row) throw new Error('insert returned no row');
      return row;
    },

    async listOpen({ clinicId, limit }) {
      return db
        .select()
        .from(escalations)
        .where(and(eq(escalations.clinicId, clinicId), isNull(escalations.resolvedAt)))
        .orderBy(desc(escalations.createdAt))
        .limit(limit);
    },

    async resolve({ id, notes }) {
      await db
        .update(escalations)
        .set({
          resolvedAt: new Date(),
          ...(notes !== undefined ? { notes } : {}),
        })
        .where(eq(escalations.id, id));
    },

    async markNotified({ id, at }) {
      await db.update(escalations).set({ notifiedAt: at }).where(eq(escalations.id, id));
    },
  };
}
