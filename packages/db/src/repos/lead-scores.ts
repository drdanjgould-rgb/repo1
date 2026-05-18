import { asc, eq } from 'drizzle-orm';
import type { Database } from '../client.js';
import { leadScores } from '../schema/lead-scores.js';
import type { LeadScore, NewLeadScore } from '../schema/lead-scores.js';

export interface LeadScoresRepo {
  insert(args: NewLeadScore): Promise<LeadScore>;
  /** Full score history for a lead, oldest first. Used for explainability. */
  historyFor(leadId: string): Promise<LeadScore[]>;
}

export function drizzleLeadScoresRepo(db: Database): LeadScoresRepo {
  return {
    async insert(args) {
      const rows = await db.insert(leadScores).values(args).returning();
      const row = rows[0];
      if (!row) throw new Error('insert returned no row');
      return row;
    },

    async historyFor(leadId) {
      return db
        .select()
        .from(leadScores)
        .where(eq(leadScores.leadId, leadId))
        .orderBy(asc(leadScores.scoredAt));
    },
  };
}
