import { randomUUID } from 'node:crypto';
import type { NewPatient, Patient } from '../../schema/patients.js';
import type { PatientsRepo } from '../patients.js';

function equalBytes(a: Uint8Array | null, b: Uint8Array | null | undefined): boolean {
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export class FakePatientsRepo implements PatientsRepo {
  readonly byId = new Map<string, Patient>();

  findByEmailHash({
    clinicId,
    emailHash,
  }: {
    clinicId: string;
    emailHash: Uint8Array;
  }): Promise<Patient | null> {
    for (const p of this.byId.values()) {
      if (p.clinicId === clinicId && equalBytes(p.emailHash, emailHash)) {
        return Promise.resolve(p);
      }
    }
    return Promise.resolve(null);
  }

  findByPhoneHash({
    clinicId,
    phoneHash,
  }: {
    clinicId: string;
    phoneHash: Uint8Array;
  }): Promise<Patient | null> {
    for (const p of this.byId.values()) {
      if (p.clinicId === clinicId && equalBytes(p.phoneHash, phoneHash)) {
        return Promise.resolve(p);
      }
    }
    return Promise.resolve(null);
  }

  create(args: NewPatient): Promise<Patient> {
    const row: Patient = {
      id: randomUUID(),
      clinicId: args.clinicId,
      nameEncrypted: args.nameEncrypted ?? null,
      contactEncrypted: args.contactEncrypted ?? null,
      emailHash: args.emailHash ?? null,
      phoneHash: args.phoneHash ?? null,
      createdAt: args.createdAt ?? new Date(),
    };
    this.byId.set(row.id, row);
    return Promise.resolve(row);
  }

  updateMinimal(args: Parameters<PatientsRepo['updateMinimal']>[0]): Promise<void> {
    const p = this.byId.get(args.id);
    if (!p) return Promise.resolve();
    const next: Patient = {
      ...p,
      ...(args.nameEncrypted !== undefined ? { nameEncrypted: args.nameEncrypted } : {}),
      ...(args.contactEncrypted !== undefined ? { contactEncrypted: args.contactEncrypted } : {}),
      ...(args.emailHash !== undefined ? { emailHash: args.emailHash } : {}),
      ...(args.phoneHash !== undefined ? { phoneHash: args.phoneHash } : {}),
    };
    this.byId.set(args.id, next);
    return Promise.resolve();
  }
}
