import { and, eq } from 'drizzle-orm';
import type { Database } from '../client.js';
import { conversations } from '../schema/conversations.js';
import type {
  Conversation,
  ConversationPlatform,
  ConversationStatus,
  NewConversation,
} from '../schema/conversations.js';

export interface ConversationsRepo {
  findByThread(args: {
    clinicId: string;
    platform: ConversationPlatform;
    threadId: string;
  }): Promise<Conversation | null>;

  create(args: NewConversation): Promise<Conversation>;

  /** Update last_message_at; idempotent if `at` is older than what's stored. */
  touch(args: { id: string; at: Date }): Promise<void>;

  setStatus(args: { id: string; status: ConversationStatus }): Promise<void>;
}

export function drizzleConversationsRepo(db: Database): ConversationsRepo {
  return {
    async findByThread({ clinicId, platform, threadId }) {
      const rows = await db
        .select()
        .from(conversations)
        .where(
          and(
            eq(conversations.clinicId, clinicId),
            eq(conversations.platform, platform),
            eq(conversations.threadId, threadId),
          ),
        )
        .limit(1);
      return rows[0] ?? null;
    },

    async create(args) {
      const rows = await db.insert(conversations).values(args).returning();
      const row = rows[0];
      if (!row) throw new Error('insert returned no row');
      return row;
    },

    async touch({ id, at }) {
      await db.update(conversations).set({ lastMessageAt: at }).where(eq(conversations.id, id));
    },

    async setStatus({ id, status }) {
      await db.update(conversations).set({ status }).where(eq(conversations.id, id));
    },
  };
}
