import { sql } from 'drizzle-orm';
import { index, pgTable, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { clinics } from './clinics.js';
import { bytea } from './_types.js';

/**
 * Patients (PHI). All identifying fields are encrypted at the application
 * layer via libsodium with a key from Supabase Vault, then stored as bytea.
 *
 * `*_hash` columns hold a deterministic SHA-256 of the lowercased value;
 * they enable equality lookup ("does a patient with this email exist?")
 * without ever decrypting the encrypted column. They are NOT PHI on their
 * own (hashes of arbitrary identifiers aren't reversible without the salt),
 * but we still RLS-scope them by clinic_id for defense-in-depth.
 */
export const patients = pgTable(
  'patients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clinicId: uuid('clinic_id')
      .notNull()
      .references(() => clinics.id, { onDelete: 'cascade' }),
    nameEncrypted: bytea('name_encrypted'),
    contactEncrypted: bytea('contact_encrypted'),
    emailHash: bytea('email_hash'),
    phoneHash: bytea('phone_hash'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    clinicIdx: index('patients_clinic_idx').on(table.clinicId),
    emailHashUniq: uniqueIndex('patients_email_hash_uniq')
      .on(table.clinicId, table.emailHash)
      .where(sql`email_hash IS NOT NULL`),
    phoneHashUniq: uniqueIndex('patients_phone_hash_uniq')
      .on(table.clinicId, table.phoneHash)
      .where(sql`phone_hash IS NOT NULL`),
  }),
);

export type Patient = typeof patients.$inferSelect;
export type NewPatient = typeof patients.$inferInsert;
