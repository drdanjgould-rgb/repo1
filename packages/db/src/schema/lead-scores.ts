import { sql } from 'drizzle-orm';
import { check, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { clinics } from './clinics.js';
import { leads } from './leads.js';

/**
 * Append-only score history. Every score change writes a row here with the
 * reason; useful for debugging "why did this lead suddenly go hot?" and for
 * training future scoring models.
 *
 * `clinic_id` is denormalized (spec lists only lead_id) for single-equality
 * RLS — same rationale as `messages.clinic_id`.
 */
export const leadScores = pgTable(
  'lead_scores',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clinicId: uuid('clinic_id')
      .notNull()
      .references(() => clinics.id, { onDelete: 'cascade' }),
    leadId: uuid('lead_id')
      .notNull()
      .references(() => leads.id, { onDelete: 'cascade' }),
    score: integer('score').notNull(),
    reason: text('reason').notNull(),
    scoredAt: timestamp('scored_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    scoreRange: check('lead_scores_range', sql`${table.score} BETWEEN 0 AND 100`),
    leadScoredIdx: index('lead_scores_lead_scored_idx').on(table.leadId, table.scoredAt),
  }),
);

export type LeadScore = typeof leadScores.$inferSelect;
export type NewLeadScore = typeof leadScores.$inferInsert;
