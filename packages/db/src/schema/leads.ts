import { check, index, integer, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { clinics } from './clinics.js';
import { patients } from './patients.js';

export const leadStatus = pgEnum('lead_status', ['open', 'contacted', 'converted', 'lost']);
export type LeadStatus = (typeof leadStatus.enumValues)[number];

export const leadTier = pgEnum('lead_tier', ['hot', 'warm', 'cold', 'blocked']);
export type LeadTier = (typeof leadTier.enumValues)[number];

/**
 * One row per lead lifecycle. A patient can have multiple leads over time
 * (came in for Botox in 2025, came back for rhinoplasty in 2026 — distinct
 * leads).
 *
 * `raw_contact_redacted` is the PHI-redacted snapshot of contact info as it
 * appeared in the originating DM (e.g., "<<PHI_PHONE_001>>"). Original
 * unredacted contact info lives encrypted on `patients.contact_encrypted`.
 */
export const leads = pgTable(
  'leads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clinicId: uuid('clinic_id')
      .notNull()
      .references(() => clinics.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id').references(() => patients.id, { onDelete: 'set null' }),
    source: text('source').notNull(),
    score: integer('score').notNull().default(0),
    tier: leadTier('tier').notNull().default('cold'),
    status: leadStatus('status').notNull().default('open'),
    procedureInterest: text('procedure_interest'),
    timeline: text('timeline'),
    rawContactRedacted: text('raw_contact_redacted'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastTouchedAt: timestamp('last_touched_at', { withTimezone: true }),
  },
  (table) => ({
    scoreRange: check('leads_score_range', sql`${table.score} BETWEEN 0 AND 100`),
    clinicStatusIdx: index('leads_clinic_status_idx').on(
      table.clinicId,
      table.status,
      sql`score DESC`,
    ),
  }),
);

export type Lead = typeof leads.$inferSelect;
export type NewLead = typeof leads.$inferInsert;
