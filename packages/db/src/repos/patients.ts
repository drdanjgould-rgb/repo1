import { and, eq } from 'drizzle-orm';
import type { Database } from '../client.js';
import { patients } from '../schema/patients.js';
import type { NewPatient, Patient } from '../schema/patients.js';

export interface PatientsRepo {
  /**
   * Lookup by hashed email. Caller computes the hash (SHA-256 of
   * lowercased email) before calling; this repo doesn't do crypto.
   */
  findByEmailHash(args: { clinicId: string; emailHash: Uint8Array }): Promise<Patient | null>;
  /** Lookup by hashed phone (E.164, then SHA-256). */
  findByPhoneHash(args: { clinicId: string; phoneHash: Uint8Array }): Promise<Patient | null>;
  /** Insert a fresh patient. Encrypted fields must be encrypted by the caller. */
  create(args: NewPatient): Promise<Patient>;
  /** Partial update of encrypted columns and lookup hashes. */
  updateMinimal(args: {
    id: string;
    nameEncrypted?: Uint8Array;
    contactEncrypted?: Uint8Array;
    emailHash?: Uint8Array;
    phoneHash?: Uint8Array;
  }): Promise<void>;
}

export function drizzlePatientsRepo(db: Database): PatientsRepo {
  return {
    async findByEmailHash({ clinicId, emailHash }) {
      const rows = await db
        .select()
        .from(patients)
        .where(and(eq(patients.clinicId, clinicId), eq(patients.emailHash, emailHash)))
        .limit(1);
      return rows[0] ?? null;
    },

    async findByPhoneHash({ clinicId, phoneHash }) {
      const rows = await db
        .select()
        .from(patients)
        .where(and(eq(patients.clinicId, clinicId), eq(patients.phoneHash, phoneHash)))
        .limit(1);
      return rows[0] ?? null;
    },

    async create(args) {
      const rows = await db.insert(patients).values(args).returning();
      const row = rows[0];
      if (!row) throw new Error('insert returned no row');
      return row;
    },

    async updateMinimal({ id, ...rest }) {
      const patch: Partial<Patient> = {};
      if (rest.nameEncrypted !== undefined) patch.nameEncrypted = rest.nameEncrypted;
      if (rest.contactEncrypted !== undefined) patch.contactEncrypted = rest.contactEncrypted;
      if (rest.emailHash !== undefined) patch.emailHash = rest.emailHash;
      if (rest.phoneHash !== undefined) patch.phoneHash = rest.phoneHash;
      if (Object.keys(patch).length === 0) return;
      await db.update(patients).set(patch).where(eq(patients.id, id));
    },
  };
}
