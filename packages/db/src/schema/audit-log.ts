import { bigserial, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { clinics } from './clinics';

/**
 * Append-only audit trail. Populated by Postgres triggers attached to every
 * PHI/PII-relevant table — application code never writes here directly.
 * Writing via triggers makes the audit log unbypassable: forgetting to log
 * isn't possible, and tampering would require DDL access.
 *
 * `actor` is set per request via `SET LOCAL app.current_actor = '...'`
 * by the API layer; defaults to 'system' when unset (background jobs,
 * webhooks before resolution).
 */
export const auditLog = pgTable(
  'audit_log',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    clinicId: uuid('clinic_id').references(() => clinics.id, { onDelete: 'cascade' }),
    actor: text('actor').notNull(),
    action: text('action').notNull(),
    targetTable: text('target_table').notNull(),
    targetId: text('target_id'),
    diff: jsonb('diff')
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    clinicCreatedIdx: index('audit_log_clinic_created_idx').on(
      table.clinicId,
      sql`created_at DESC`,
    ),
    targetIdx: index('audit_log_target_idx').on(table.targetTable, table.targetId),
  }),
);

export type AuditLogEntry = typeof auditLog.$inferSelect;
