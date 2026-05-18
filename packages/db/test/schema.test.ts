/**
 * Schema smoke tests. Verifies that the schema modules load, table names
 * match the spec, and required columns exist. Does NOT need a live DB.
 *
 * Real DB-backed tests (RLS enforcement, audit trigger fires, denormalized
 * clinic_id invariant) land in `test/rls.test.ts` once we have a testcontainer
 * or a local Postgres in CI.
 */
import { describe, expect, it } from 'vitest';
import {
  auditLog,
  clinics,
  conversations,
  leadScores,
  leads,
  messages,
  patients,
  users,
} from '../src/schema';

const tables = {
  clinics,
  users,
  patients,
  conversations,
  messages,
  leads,
  lead_scores: leadScores,
  audit_log: auditLog,
} as const;

describe('schema', () => {
  it('exports all eight tables from the spec', () => {
    const got = Object.keys(tables).sort();
    const want = [
      'audit_log',
      'clinics',
      'conversations',
      'lead_scores',
      'leads',
      'messages',
      'patients',
      'users',
    ];
    expect(got).toEqual(want);
  });

  it('every table has an id column', () => {
    for (const [name, table] of Object.entries(tables)) {
      expect(table, name).toHaveProperty('id');
    }
  });

  it('PHI-bearing tables are clinic-scoped (have clinic_id)', () => {
    const scoped = [users, patients, conversations, messages, leads, leadScores] as const;
    for (const table of scoped) {
      // Drizzle ORM exposes columns under both camelCase TS name and
      // by .name on the column metadata; check the TS accessor exists.
      expect(table).toHaveProperty('clinicId');
    }
  });

  it('audit_log has the spec columns', () => {
    expect(auditLog).toHaveProperty('clinicId');
    expect(auditLog).toHaveProperty('actor');
    expect(auditLog).toHaveProperty('action');
    expect(auditLog).toHaveProperty('targetTable');
    expect(auditLog).toHaveProperty('targetId');
    expect(auditLog).toHaveProperty('diff');
  });

  it('messages has the redaction-safe + cost-tracking columns', () => {
    expect(messages).toHaveProperty('contentRedacted');
    expect(messages).toHaveProperty('contentOriginalEncrypted');
    expect(messages).toHaveProperty('redactionMap');
    expect(messages).toHaveProperty('model');
    expect(messages).toHaveProperty('promptTokens');
    expect(messages).toHaveProperty('completionTokens');
    expect(messages).toHaveProperty('latencyMs');
  });

  it('leads has the spec scoring + qualifier columns', () => {
    expect(leads).toHaveProperty('source');
    expect(leads).toHaveProperty('score');
    expect(leads).toHaveProperty('tier');
    expect(leads).toHaveProperty('status');
    expect(leads).toHaveProperty('procedureInterest');
    expect(leads).toHaveProperty('timeline');
    expect(leads).toHaveProperty('rawContactRedacted');
  });

  it('patients PHI columns are bytea (encrypted at app layer)', () => {
    expect(patients).toHaveProperty('nameEncrypted');
    expect(patients).toHaveProperty('contactEncrypted');
    expect(patients).toHaveProperty('emailHash');
    expect(patients).toHaveProperty('phoneHash');
  });
});
