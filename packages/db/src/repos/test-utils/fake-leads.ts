import { randomUUID } from 'node:crypto';
import type { Lead, LeadTier, NewLead } from '../../schema/leads.js';
import type { LeadsRepo } from '../leads.js';

export class FakeLeadsRepo implements LeadsRepo {
  readonly byId = new Map<string, Lead>();

  findOpenByPatient({ clinicId, patientId }: { clinicId: string; patientId: string }) {
    let newest: Lead | null = null;
    for (const l of this.byId.values()) {
      if (
        l.clinicId === clinicId &&
        l.contactId === patientId &&
        l.status === 'open' &&
        (!newest || l.createdAt > newest.createdAt)
      ) {
        newest = l;
      }
    }
    return Promise.resolve(newest);
  }

  create(args: NewLead): Promise<Lead> {
    const row: Lead = {
      id: randomUUID(),
      clinicId: args.clinicId,
      contactId: args.contactId ?? null,
      source: args.source,
      score: args.score ?? 0,
      tier: args.tier ?? 'cold',
      status: args.status ?? 'open',
      procedureInterest: args.procedureInterest ?? null,
      timeline: args.timeline ?? null,
      rawContactRedacted: args.rawContactRedacted ?? null,
      createdAt: args.createdAt ?? new Date(),
      lastTouchedAt: args.lastTouchedAt ?? null,
    };
    this.byId.set(row.id, row);
    return Promise.resolve(row);
  }

  updateScore(args: Parameters<LeadsRepo['updateScore']>[0]): Promise<void> {
    const l = this.byId.get(args.id);
    if (!l) return Promise.resolve();
    const next: Lead = {
      ...l,
      score: args.score,
      tier: args.tier,
      lastTouchedAt: new Date(),
      ...(args.procedureInterest !== undefined
        ? { procedureInterest: args.procedureInterest }
        : {}),
      ...(args.timeline !== undefined ? { timeline: args.timeline } : {}),
      ...(args.rawContactRedacted !== undefined
        ? { rawContactRedacted: args.rawContactRedacted }
        : {}),
    };
    this.byId.set(args.id, next);
    return Promise.resolve();
  }

  setStatus({ id, status }: { id: string; status: Lead['status'] }) {
    const l = this.byId.get(id);
    if (!l) return Promise.resolve();
    this.byId.set(id, { ...l, status, lastTouchedAt: new Date() });
    return Promise.resolve();
  }

  listRecent({ clinicId, limit, tier }: { clinicId: string; limit: number; tier?: LeadTier }) {
    const subset = [...this.byId.values()]
      .filter((l) => l.clinicId === clinicId && (tier ? l.tier === tier : true))
      .sort((a, b) => {
        const at = a.lastTouchedAt?.getTime() ?? a.createdAt.getTime();
        const bt = b.lastTouchedAt?.getTime() ?? b.createdAt.getTime();
        return bt - at;
      });
    return Promise.resolve(subset.slice(0, limit));
  }

  countByTierSince({ clinicId, since }: { clinicId: string; since: Date }) {
    const out: Record<LeadTier, number> = { hot: 0, warm: 0, cold: 0, blocked: 0 };
    for (const l of this.byId.values()) {
      if (l.clinicId === clinicId && l.createdAt.getTime() >= since.getTime()) {
        out[l.tier] += 1;
      }
    }
    return Promise.resolve(out);
  }
}
