import { randomUUID } from 'node:crypto';
import type { Conversation, NewConversation } from '../../schema/conversations.js';
import type { ConversationsRepo } from '../conversations.js';

/**
 * In-memory fake. Honors the same (clinic_id, platform, thread_id)
 * uniqueness as the drizzle impl + production schema.
 */
export class FakeConversationsRepo implements ConversationsRepo {
  readonly byId = new Map<string, Conversation>();

  findByThread(args: Parameters<ConversationsRepo['findByThread']>[0]) {
    for (const c of this.byId.values()) {
      if (
        c.clinicId === args.clinicId &&
        c.platform === args.platform &&
        c.threadId === args.threadId
      ) {
        return Promise.resolve(c);
      }
    }
    return Promise.resolve(null);
  }

  async create(args: NewConversation): Promise<Conversation> {
    const row: Conversation = {
      id: randomUUID(),
      clinicId: args.clinicId,
      platform: args.platform,
      threadId: args.threadId,
      contactId: args.contactId ?? null,
      status: args.status ?? 'open',
      lastMessageAt: args.lastMessageAt ?? null,
      createdAt: args.createdAt ?? new Date(),
    };
    // Enforce (clinic, platform, thread) uniqueness — matches the schema.
    for (const c of this.byId.values()) {
      if (
        c.clinicId === row.clinicId &&
        c.platform === row.platform &&
        c.threadId === row.threadId
      ) {
        throw new Error(
          `duplicate conversation: clinic=${row.clinicId} platform=${row.platform} thread=${row.threadId}`,
        );
      }
    }
    this.byId.set(row.id, row);
    return row;
  }

  touch({ id, at }: { id: string; at: Date }) {
    const c = this.byId.get(id);
    if (c) this.byId.set(id, { ...c, lastMessageAt: at });
    return Promise.resolve();
  }

  setStatus({ id, status }: { id: string; status: Conversation['status'] }) {
    const c = this.byId.get(id);
    if (c) this.byId.set(id, { ...c, status });
    return Promise.resolve();
  }
}
