import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

const url =
  process.env.DATABASE_URL ??
  // drizzle-kit `generate` does not need a live DB; the placeholder keeps
  // CLI commands runnable in CI without secrets. Any command that actually
  // talks to the DB (`migrate`, `push`, `studio`) will fail loud — by design.
  'postgres://placeholder:placeholder@localhost:5432/placeholder';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './drizzle',
  dbCredentials: { url },
  verbose: true,
  strict: true,
});
