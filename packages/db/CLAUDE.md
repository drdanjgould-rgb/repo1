# packages/db — Conventions

## Schema changes

1. Edit `src/schema/<table>.ts`.
2. Run `pnpm db:generate` to produce the SQL migration. Drizzle-kit names
   it `000N_<auto>.sql` — rename to a descriptive `000N_<change>.sql`.
3. If RLS / triggers / functions need to change with the schema, add a
   companion hand-written `000N+1_<change>_sec.sql`.
4. Update `drizzle/meta/_journal.json` for hand-written files and copy the
   matching snapshot from the prior entry.
5. Test against a real Postgres before committing.

## TS conventions

- Module resolution is `Bundler` in this package's tsconfig (drizzle-kit
  requirement). Imports do NOT use the `.js` suffix. This deviates from
  the root tsconfig — intentional.
- Schema modules export a typed table constant + `inferSelect` /
  `inferInsert` types. No business logic lives in this package.
- Connection setup goes through `createClient()`. Never instantiate
  `postgres-js` directly from another package.

## Never

- INSERT into `audit_log` from app code (use triggers).
- Bypass RLS from API request paths. The `service_role` URL is for trusted
  workers only.
- Store PHI plaintext. Always encrypt at the app layer before insert.
- Query encrypted columns with `WHERE name = '...'` — use the hash column.

## Migrations are forward-only

We do not maintain `down` migrations. Recovering from a broken migration
means writing a new forward migration that undoes the damage. Rationale:
production Supabase is the source of truth; downward rollbacks are
historically the source of more outages than they prevent.
