import { sql } from 'drizzle-orm';
import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Multi-tenant root. Every other PHI/PII row carries a `clinic_id` FK and is
 * RLS-isolated by it.
 */
export const clinics = pgTable('clinics', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  settings: jsonb('settings')
    .notNull()
    .default(sql`'{}'::jsonb`)
    .$type<ClinicSettings>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export interface ClinicSettings {
  timezone?: string;
  service_area_zips?: string[];
  lead_scoring_weights?: Record<string, number>;
  meta_page_id?: string;
  ghl_location_id?: string;
}

export type Clinic = typeof clinics.$inferSelect;
export type NewClinic = typeof clinics.$inferInsert;
