/**
 * Seed script — local dev only. Idempotent: re-running won't duplicate.
 *
 * Creates:
 *   - Clinic: Gould Plastic Surgery
 *   - User:   daniel@gouldplasticsurgery.com (role: owner)
 *
 * Run after migrations:  pnpm --filter @contourai/db db:seed
 */
import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { createClient } from './client.js';
import { clinics, users } from './schema/index.js';

const GOULD_SLUG = 'gould-plastic-surgery';
const GOULD_OWNER_EMAIL = 'daniel@gouldplasticsurgery.com';

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is required');
  }

  const { db, close } = createClient({ url, max: 1 });

  try {
    const existing = await db
      .select({ id: clinics.id })
      .from(clinics)
      .where(eq(clinics.slug, GOULD_SLUG))
      .limit(1);

    const clinicId =
      existing[0]?.id ??
      (
        await db
          .insert(clinics)
          .values({
            name: 'Gould Plastic Surgery',
            slug: GOULD_SLUG,
            settings: {
              timezone: 'America/Los_Angeles',
              service_area_zips: ['90210', '90211', '90212'],
            },
          })
          .returning({ id: clinics.id })
      )[0]?.id;

    if (!clinicId) {
      throw new Error('Failed to create or read clinic');
    }
    console.log(`Clinic ready:  ${clinicId}  (slug=${GOULD_SLUG})`);

    const emailLower = GOULD_OWNER_EMAIL.toLowerCase();
    const existingUser = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, emailLower))
      .limit(1);

    if (existingUser[0]) {
      console.log(`User ready:    ${existingUser[0].id}  (${emailLower})`);
    } else {
      const inserted = await db
        .insert(users)
        .values({
          clinicId,
          email: emailLower,
          role: 'owner',
        })
        .returning({ id: users.id });
      console.log(`User created:  ${inserted[0]?.id}  (${emailLower})`);
    }
  } finally {
    await close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
