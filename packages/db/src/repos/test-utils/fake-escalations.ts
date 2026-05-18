import { randomUUID } from 'node:crypto';
import type { Escalation, NewEscalation } from '../../schema/escalations.js';
import type { EscalationsRepo } from '../escalations.js';

export class FakeEscalationsRepo implements EscalationsRepo {
  readonly rows: Escalation[] = [];

  insert(args: NewEscalation): Promise<Escalation> {
    const row: Escalation = {
      id: randomUUID(),
      clinicId: args.clinicId,
      conversationId: args.conversationId ?? null,
      patientId: args.patientId ?? null,
      messageId: args.messageId ?? null,
      reason: args.reason,
      category: args.category ?? 'none',
      severity: args.severity ?? 3,
      rationale: args.rationale ?? null,
      notifiedAt: args.notifiedAt ?? null,
      resolvedAt: args.resolvedAt ?? null,
      notes: args.notes ?? null,
      createdAt: args.createdAt ?? new Date(),
    };
    this.rows.push(row);
    return Promise.resolve(row);
  }

  listOpen({ clinicId, limit }: { clinicId: string; limit: number }) {
    const subset = this.rows
      .filter((r) => r.clinicId === clinicId && r.resolvedAt === null)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return Promise.resolve(subset.slice(0, limit));
  }

  resolve({ id, notes }: { id: string; notes?: string }) {
    const idx = this.rows.findIndex((r) => r.id === id);
    if (idx >= 0) {
      const existing = this.rows[idx];
      if (!existing) return Promise.resolve();
      this.rows[idx] = {
        ...existing,
        resolvedAt: new Date(),
        notes: notes ?? existing.notes,
      };
    }
    return Promise.resolve();
  }

  markNotified({ id, at }: { id: string; at: Date }) {
    const idx = this.rows.findIndex((r) => r.id === id);
    if (idx >= 0) {
      const existing = this.rows[idx];
      if (!existing) return Promise.resolve();
      this.rows[idx] = { ...existing, notifiedAt: at };
    }
    return Promise.resolve();
  }
}
