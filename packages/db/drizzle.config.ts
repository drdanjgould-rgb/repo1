import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

const url =
  process.env.DATABASE_URL ??
  // drizzle-kit `generate` does not need a live DB; the placeholder keeps
  // CLI commands runnable in CI without secrets. Any command that actually
  // talks to the DB (`migrate`, `push`, `studio`) will fail loud — by design.
  'postgres://placeholder:placeholder@localhost:5432/placeholder';

// IMPORTANT: drizzle-kit reads `./dist/schema/index.js` — the BUILT schema —
// not the TS source. NodeNext `.js` import suffixes in the source files
// don't survive drizzle-kit's CJS loader, so we run `tsc -b` first and
// point drizzle-kit at the compiled JS. The build step is part of
// `pnpm db:generate` (see scripts).
export default defineConfig({
  dialect: 'postgresql',
  schema: './dist/schema/index.js',
  out: './drizzle',
  dbCredentials: { url },
  verbose: true,
  strict: true,
});
