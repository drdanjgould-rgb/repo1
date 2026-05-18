import { randomUUID } from 'node:crypto';
import type { LeadScore, NewLeadScore } from '../../schema/lead-scores.js';
import type { LeadScoresRepo } from '../lead-scores.js';

export class FakeLeadScoresRepo implements LeadScoresRepo {
  readonly rows: LeadScore[] = [];

  insert(args: NewLeadScore): Promise<LeadScore> {
    const row: LeadScore = {
      id: randomUUID(),
      clinicId: args.clinicId,
      leadId: args.leadId,
      score: args.score,
      reason: args.reason,
      scoredAt: args.scoredAt ?? new Date(),
    };
    this.rows.push(row);
    return Promise.resolve(row);
  }

  historyFor(leadId: string): Promise<LeadScore[]> {
    const subset = this.rows
      .filter((r) => r.leadId === leadId)
      .sort((a, b) => a.scoredAt.getTime() - b.scoredAt.getTime());
    return Promise.resolve(subset);
  }
}
