import { check, integer, pgEnum, pgTable, text, timestamp, uuid, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { clinics } from './clinics';
import { conversations } from './conversations';
import { messages } from './messages';
import { patients } from './patients';

export const escalationReason = pgEnum('escalation_reason', [
  'red_flag_medical',
  'human_handoff_request',
  'complaint',
  'compliance',
  'other',
]);
export type EscalationReason = (typeof escalationReason.enumValues)[number];

export const escalationCategory = pgEnum('escalation_category', [
  'medical_emergency',
  'post_op_complication',
  'mental_health',
  'none',
]);
export type EscalationCategory = (typeof escalationCategory.enumValues)[number];

/**
 * One row per safety / handoff event. Populated by the Concierge worker
 * when triage fires; read by staff queue UI (lands with Module 4).
 *
 * Foreign keys are `ON DELETE SET NULL` so an escalation row outlives
 * its triggering message — escalations are the audit record.
 */
export const escalations = pgTable(
  'escalations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clinicId: uuid('clinic_id')
      .notNull()
      .references(() => clinics.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id').references(() => conversations.id, {
      onDelete: 'set null',
    }),
    patientId: uuid('patient_id').references(() => patients.id, { onDelete: 'set null' }),
    messageId: uuid('message_id').references(() => messages.id, { onDelete: 'set null' }),
    reason: escalationReason('reason').notNull(),
    category: escalationCategory('category').notNull().default('none'),
    severity: integer('severity').notNull().default(3),
    rationale: text('rationale'),
    notifiedAt: timestamp('notified_at', { withTimezone: true }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    severityRange: check('escalations_severity_range', sql`${table.severity} BETWEEN 1 AND 5`),
    openClinicIdx: index('escalations_open_clinic_idx').on(table.clinicId, sql`created_at DESC`),
  }),
);

export type Escalation = typeof escalations.$inferSelect;
export type NewEscalation = typeof escalations.$inferInsert;
