import { pgTable, pgEnum, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { clinics } from './clinics';

export const userRole = pgEnum('user_role', ['owner', 'admin', 'staff', 'viewer']);
export type UserRole = (typeof userRole.enumValues)[number];

/**
 * Clinic staff (not patients). `auth_user_id` maps to Supabase Auth's
 * `auth.users.id` once SSO is wired; nullable for seeded users.
 *
 * Convention: email is always lowercased at the application layer before
 * insert/lookup. Avoids the citext extension dependency.
 */
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clinicId: uuid('clinic_id')
      .notNull()
      .references(() => clinics.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: userRole('role').notNull().default('staff'),
    authUserId: uuid('auth_user_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    clinicEmailUniq: unique('users_clinic_email_uniq').on(table.clinicId, table.email),
  }),
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
