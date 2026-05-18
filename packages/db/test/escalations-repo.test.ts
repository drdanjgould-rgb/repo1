import { describe, expect, it } from 'vitest';
import { FakeEscalationsRepo } from '../src/repos/test-utils/fake-escalations.js';

const CLINIC_A = '00000000-0000-0000-0000-000000000001';
const CLINIC_B = '00000000-0000-0000-0000-000000000002';

describe('FakeEscalationsRepo', () => {
  it('inserts and lists open escalations newest-first', async () => {
    const repo = new FakeEscalationsRepo();
    const old = await repo.insert({
      clinicId: CLINIC_A,
      reason: 'red_flag_medical',
      category: 'medical_emergency',
      severity: 5,
      createdAt: new Date(2026, 0, 1),
    });
    const fresh = await repo.insert({
      clinicId: CLINIC_A,
      reason: 'red_flag_medical',
      category: 'medical_emergency',
      severity: 4,
      createdAt: new Date(2026, 4, 1),
    });
    const open = await repo.listOpen({ clinicId: CLINIC_A, limit: 10 });
    expect(open).toHaveLength(2);
    expect(open[0]?.id).toBe(fresh.id);
    expect(open[1]?.id).toBe(old.id);
  });

  it('filters by clinic_id', async () => {
    const repo = new FakeEscalationsRepo();
    await repo.insert({
      clinicId: CLINIC_A,
      reason: 'red_flag_medical',
      category: 'medical_emergency',
      severity: 5,
    });
    await repo.insert({
      clinicId: CLINIC_B,
      reason: 'red_flag_medical',
      category: 'medical_emergency',
      severity: 5,
    });
    const onlyA = await repo.listOpen({ clinicId: CLINIC_A, limit: 10 });
    expect(onlyA.every((e) => e.clinicId === CLINIC_A)).toBe(true);
  });

  it('resolve marks resolved_at and updates notes', async () => {
    const repo = new FakeEscalationsRepo();
    const e = await repo.insert({
      clinicId: CLINIC_A,
      reason: 'red_flag_medical',
      category: 'medical_emergency',
      severity: 4,
    });
    await repo.resolve({ id: e.id, notes: 'spoke with patient, ambulance dispatched' });
    const remaining = await repo.listOpen({ clinicId: CLINIC_A, limit: 10 });
    expect(remaining).toHaveLength(0);
    const resolved = repo.rows.find((r) => r.id === e.id);
    expect(resolved?.notes).toContain('ambulance');
    expect(resolved?.resolvedAt).not.toBeNull();
  });

  it('markNotified stamps notified_at', async () => {
    const repo = new FakeEscalationsRepo();
    const e = await repo.insert({
      clinicId: CLINIC_A,
      reason: 'red_flag_medical',
      category: 'medical_emergency',
      severity: 5,
    });
    const at = new Date('2026-05-18T12:00:00Z');
    await repo.markNotified({ id: e.id, at });
    const row = repo.rows.find((r) => r.id === e.id);
    expect(row?.notifiedAt?.toISOString()).toBe(at.toISOString());
  });
});
