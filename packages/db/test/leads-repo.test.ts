import { describe, expect, it } from 'vitest';
import { FakeLeadsRepo } from '../src/repos/test-utils/fake-leads.js';

const CLINIC = '00000000-0000-0000-0000-000000000001';
const PATIENT = '00000000-0000-0000-0000-000000000010';

describe('FakeLeadsRepo', () => {
  it('findOpenByPatient returns null when none exist', async () => {
    const repo = new FakeLeadsRepo();
    expect(await repo.findOpenByPatient({ clinicId: CLINIC, patientId: PATIENT })).toBeNull();
  });

  it('creates an open lead and finds it', async () => {
    const repo = new FakeLeadsRepo();
    const created = await repo.create({
      clinicId: CLINIC,
      contactId: PATIENT,
      source: 'instagram_dm',
    });
    const found = await repo.findOpenByPatient({ clinicId: CLINIC, patientId: PATIENT });
    expect(found?.id).toBe(created.id);
  });

  it('returns the newest open lead when multiple exist', async () => {
    const repo = new FakeLeadsRepo();
    await repo.create({
      clinicId: CLINIC,
      contactId: PATIENT,
      source: 'instagram_dm',
      createdAt: new Date(2026, 0, 1),
    });
    const fresh = await repo.create({
      clinicId: CLINIC,
      contactId: PATIENT,
      source: 'tiktok_dm',
      createdAt: new Date(2026, 4, 1),
    });
    const found = await repo.findOpenByPatient({ clinicId: CLINIC, patientId: PATIENT });
    expect(found?.id).toBe(fresh.id);
  });

  it('updateScore overwrites score, tier, and bumps last_touched_at', async () => {
    const repo = new FakeLeadsRepo();
    const created = await repo.create({
      clinicId: CLINIC,
      contactId: PATIENT,
      source: 'instagram_dm',
    });
    await repo.updateScore({
      id: created.id,
      score: 80,
      tier: 'hot',
      procedureInterest: 'rhinoplasty',
    });
    const after = repo.byId.get(created.id);
    expect(after?.score).toBe(80);
    expect(after?.tier).toBe('hot');
    expect(after?.procedureInterest).toBe('rhinoplasty');
    expect(after?.lastTouchedAt).not.toBeNull();
  });

  it('setStatus updates status and stamps last_touched_at', async () => {
    const repo = new FakeLeadsRepo();
    const created = await repo.create({
      clinicId: CLINIC,
      contactId: PATIENT,
      source: 'instagram_dm',
    });
    await repo.setStatus({ id: created.id, status: 'converted' });
    const after = repo.byId.get(created.id);
    expect(after?.status).toBe('converted');
    expect(after?.lastTouchedAt).not.toBeNull();
  });

  it('a converted lead is no longer returned by findOpenByPatient', async () => {
    const repo = new FakeLeadsRepo();
    const created = await repo.create({
      clinicId: CLINIC,
      contactId: PATIENT,
      source: 'instagram_dm',
    });
    await repo.setStatus({ id: created.id, status: 'converted' });
    const found = await repo.findOpenByPatient({ clinicId: CLINIC, patientId: PATIENT });
    expect(found).toBeNull();
  });
});
