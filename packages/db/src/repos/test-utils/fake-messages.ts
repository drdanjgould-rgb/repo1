import { randomUUID } from 'node:crypto';
import type { Message, NewMessage } from '../../schema/messages.js';
import type { MessagesRepo } from '../messages.js';

export class FakeMessagesRepo implements MessagesRepo {
  readonly rows: Message[] = [];

  insert(args: NewMessage): Promise<Message> {
    const row = this.materialize(args);
    this.rows.push(row);
    return Promise.resolve(row);
  }

  insertIdempotent(args: NewMessage & { platformMsgId: string }): Promise<Message> {
    const existing = this.rows.find(
      (r) => r.conversationId === args.conversationId && r.platformMsgId === args.platformMsgId,
    );
    if (existing) return Promise.resolve(existing);
    const row = this.materialize(args);
    this.rows.push(row);
    return Promise.resolve(row);
  }

  recentByConversation({ conversationId, limit }: { conversationId: string; limit: number }) {
    const subset = this.rows
      .filter((r) => r.conversationId === conversationId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    return Promise.resolve(subset.slice(-limit));
  }

  countInboundSince({ conversationId, since }: { conversationId: string; since: Date }) {
    const n = this.rows.filter(
      (r) =>
        r.conversationId === conversationId && r.direction === 'inbound' && r.createdAt >= since,
    ).length;
    return Promise.resolve(n);
  }

  private materialize(args: NewMessage): Message {
    return {
      id: randomUUID(),
      conversationId: args.conversationId,
      clinicId: args.clinicId,
      direction: args.direction,
      role: args.role,
      contentRedacted: args.contentRedacted,
      contentOriginalEncrypted: args.contentOriginalEncrypted ?? null,
      redactionMap: args.redactionMap ?? null,
      model: args.model ?? null,
      promptTokens: args.promptTokens ?? null,
      completionTokens: args.completionTokens ?? null,
      latencyMs: args.latencyMs ?? null,
      platformMsgId: args.platformMsgId ?? null,
      createdAt: args.createdAt ?? new Date(),
    };
  }
}
