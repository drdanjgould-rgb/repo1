import { and, asc, desc, eq, gte } from 'drizzle-orm';
import type { Database } from '../client.js';
import { messages } from '../schema/messages.js';
import type { Message, NewMessage } from '../schema/messages.js';

export interface MessagesRepo {
  insert(args: NewMessage): Promise<Message>;
  /**
   * Idempotent insert keyed on (conversation_id, platform_msg_id). If a
   * row with the same platform_msg_id exists for the conversation, this
   * is a no-op and returns the existing row.
   */
  insertIdempotent(args: NewMessage & { platformMsgId: string }): Promise<Message>;
  /** Last N messages in a conversation, oldest first (for LLM context). */
  recentByConversation(args: { conversationId: string; limit: number }): Promise<Message[]>;
  /** Count of messages a patient sent on or after `since`. Used by lead scoring. */
  countInboundSince(args: { conversationId: string; since: Date }): Promise<number>;
}

export function drizzleMessagesRepo(db: Database): MessagesRepo {
  return {
    async insert(args) {
      const rows = await db.insert(messages).values(args).returning();
      const row = rows[0];
      if (!row) throw new Error('insert returned no row');
      return row;
    },

    async insertIdempotent(args) {
      // The schema has a partial unique index on (conversation_id, platform_msg_id)
      // where platform_msg_id IS NOT NULL. Use ON CONFLICT DO NOTHING + a follow-up
      // select to get the canonical row when a duplicate is suppressed.
      const inserted = await db.insert(messages).values(args).onConflictDoNothing().returning();
      if (inserted[0]) return inserted[0];
      const rows = await db
        .select()
        .from(messages)
        .where(
          and(
            eq(messages.conversationId, args.conversationId),
            eq(messages.platformMsgId, args.platformMsgId),
          ),
        )
        .limit(1);
      const existing = rows[0];
      if (!existing) throw new Error('insert was suppressed but no existing row found');
      return existing;
    },

    async recentByConversation({ conversationId, limit }) {
      // Pull DESC limit N, then reverse so the caller gets oldest-first.
      const rows = await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, conversationId))
        .orderBy(desc(messages.createdAt))
        .limit(limit);
      return rows.slice().reverse();
    },

    async countInboundSince({ conversationId, since }) {
      const rows = await db
        .select()
        .from(messages)
        .where(
          and(
            eq(messages.conversationId, conversationId),
            eq(messages.direction, 'inbound'),
            gte(messages.createdAt, since),
          ),
        )
        .orderBy(asc(messages.createdAt));
      return rows.length;
    },
  };
}
