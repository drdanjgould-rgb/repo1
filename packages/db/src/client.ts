import { sql } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import * as schema from './schema/index';

export type Database = PostgresJsDatabase<typeof schema>;

export interface CreateClientOptions {
  url: string;
  /** Max connections in the pool. Default 10 for workers, 1 for migrations. */
  max?: number;
  /** Disable SSL — local-dev only. */
  ssl?: boolean;
}

export function createClient(opts: CreateClientOptions): {
  db: Database;
  raw: Sql;
  close: () => Promise<void>;
} {
  const raw = postgres(opts.url, {
    max: opts.max ?? 10,
    ssl: opts.ssl === false ? false : 'prefer',
    prepare: false,
  });
  const db = drizzle(raw, { schema });
  return {
    db,
    raw,
    close: () => raw.end({ timeout: 5 }),
  };
}

/**
 * Set the per-transaction tenant + actor context that RLS policies and
 * audit triggers read. Call this at the start of any DB transaction that
 * runs on behalf of a clinic.
 *
 *   await db.transaction(async (tx) => {
 *     await setRequestContext(tx, { clinicId, actor: 'user:<uuid>' });
 *     // ...queries here are RLS-scoped to clinicId...
 *   });
 *
 * `SET LOCAL` scopes the setting to the transaction; it expires on commit.
 */
export async function setRequestContext(
  tx: Database,
  ctx: { clinicId: string; actor: string },
): Promise<void> {
  await tx.execute(sql`SELECT set_config('app.current_clinic_id', ${ctx.clinicId}, true)`);
  await tx.execute(sql`SELECT set_config('app.current_actor', ${ctx.actor}, true)`);
}
