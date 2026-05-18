/**
 * Migration runner. Invoked via `pnpm --filter @contourai/db db:migrate`.
 * Reads ./drizzle/meta/_journal.json and applies pending migrations using
 * drizzle's built-in migrator (Postgres dialect).
 */
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is required');
  }
  const sql = postgres(url, { max: 1, ssl: 'prefer', prepare: false });
  const db = drizzle(sql);
  console.log('Running migrations...');
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('Migrations complete.');
  await sql.end({ timeout: 5 });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
