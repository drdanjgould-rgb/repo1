import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { clinics } from './clinics.js';
import { conversations } from './conversations.js';
import { bytea } from './_types.js';

export const messageDirection = pgEnum('message_direction', ['inbound', 'outbound']);
export type MessageDirection = (typeof messageDirection.enumValues)[number];

export const messageRole = pgEnum('message_role', ['patient', 'assistant', 'staff', 'system']);
export type MessageRole = (typeof messageRole.enumValues)[number];

/**
 * Every patient-facing message. `content_redacted` is the only field we
 * ever log; `content_original_encrypted` is the unredacted original
 * encrypted at the application layer (read only when authorized).
 *
 * Note: `clinic_id` is denormalized from `conversations.clinic_id` so that
 * RLS policies can be a single equality check instead of a subquery on
 * every read. The seed and worker code keep it in sync; a CHECK trigger
 * (added in 0002_audit_and_invariants.sql) prevents drift.
 */
export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clinicId: uuid('clinic_id')
      .notNull()
      .references(() => clinics.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    direction: messageDirection('direction').notNull(),
    role: messageRole('role').notNull(),
    contentRedacted: text('content_redacted').notNull(),
    contentOriginalEncrypted: bytea('content_original_encrypted'),
    redactionMap: jsonb('redaction_map').$type<Record<string, string>>(),
    model: text('model'),
    promptTokens: integer('prompt_tokens'),
    completionTokens: integer('completion_tokens'),
    latencyMs: integer('latency_ms'),
    platformMsgId: text('platform_msg_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    convCreatedIdx: index('messages_conversation_created_idx').on(
      table.conversationId,
      table.createdAt,
    ),
    platformMsgUniq: uniqueIndex('messages_platform_msg_uniq')
      .on(table.conversationId, table.platformMsgId)
      .where(sql`platform_msg_id IS NOT NULL`),
  }),
);

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
