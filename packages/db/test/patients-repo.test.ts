import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { FakePatientsRepo } from '../src/repos/test-utils/fake-patients.js';

const CLINIC = '00000000-0000-0000-0000-000000000001';
const hash = (s: string): Uint8Array => createHash('sha256').update(s.toLowerCase()).digest();

describe('FakePatientsRepo', () => {
  it('returns null when no patient matches the email hash', async () => {
    const repo = new FakePatientsRepo();
    expect(await repo.findByEmailHash({ clinicId: CLINIC, emailHash: hash('a@b.com') })).toBeNull();
  });

  it('round-trips by email hash', async () => {
    const repo = new FakePatientsRepo();
    const emailHash = hash('sarah@example.com');
    const created = await repo.create({ clinicId: CLINIC, emailHash });
    const found = await repo.findByEmailHash({ clinicId: CLINIC, emailHash });
    expect(found?.id).toBe(created.id);
  });

  it('round-trips by phone hash', async () => {
    const repo = new FakePatientsRepo();
    const phoneHash = hash('+15551234567');
    const created = await repo.create({ clinicId: CLINIC, phoneHash });
    const found = await repo.findByPhoneHash({ clinicId: CLINIC, phoneHash });
    expect(found?.id).toBe(created.id);
  });

  it('scopes lookups by clinic_id', async () => {
    const repo = new FakePatientsRepo();
    const emailHash = hash('sarah@example.com');
    await repo.create({ clinicId: CLINIC, emailHash });
    const other = await repo.findByEmailHash({
      clinicId: '00000000-0000-0000-0000-000000000099',
      emailHash,
    });
    expect(other).toBeNull();
  });

  it('updateMinimal patches encrypted columns and hashes', async () => {
    const repo = new FakePatientsRepo();
    const patient = await repo.create({ clinicId: CLINIC });
    const newName = new Uint8Array([1, 2, 3]);
    const newEmail = hash('newly@known.com');
    await repo.updateMinimal({ id: patient.id, nameEncrypted: newName, emailHash: newEmail });
    const after = repo.byId.get(patient.id);
    expect(after?.nameEncrypted).toEqual(newName);
    expect(after?.emailHash).toEqual(newEmail);
  });
});
