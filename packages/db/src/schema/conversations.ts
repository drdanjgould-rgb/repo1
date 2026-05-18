import { sql } from 'drizzle-orm';
import { index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { clinics } from './clinics';
import { patients } from './patients';

export const conversationPlatform = pgEnum('conversation_platform', [
  'instagram',
  'tiktok',
  'sms',
  'voice',
  'web',
  'email',
]);
export type ConversationPlatform = (typeof conversationPlatform.enumValues)[number];

export const conversationStatus = pgEnum('conversation_status', ['open', 'closed', 'escalated']);
export type ConversationStatus = (typeof conversationStatus.enumValues)[number];

/**
 * One conversation per (clinic, platform, thread_id). `contact_id` (per spec)
 * is nullable — early in a DM we may not have resolved the patient yet.
 */
export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clinicId: uuid('clinic_id')
      .notNull()
      .references(() => clinics.id, { onDelete: 'cascade' }),
    platform: conversationPlatform('platform').notNull(),
    threadId: text('thread_id').notNull(),
    contactId: uuid('contact_id').references(() => patients.id, {
      onDelete: 'set null',
    }),
    status: conversationStatus('status').notNull().default('open'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
  },
  (table) => ({
    threadUniq: uniqueIndex('conversations_thread_uniq').on(
      table.clinicId,
      table.platform,
      table.threadId,
    ),
    clinicLastMsgIdx: index('conversations_clinic_last_msg_idx').on(
      table.clinicId,
      sql`last_message_at DESC NULLS LAST`,
    ),
  }),
);

export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;
