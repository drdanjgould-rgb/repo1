/**
 * Shared column-type helpers. Drizzle's built-ins don't cover bytea or citext;
 * we define them as customType so the schema stays in TS rather than splitting
 * across raw SQL.
 */
import { customType } from 'drizzle-orm/pg-core';

/**
 * Binary blob — used for PHI columns. The application layer encrypts/decrypts
 * via libsodium with a key fetched from Supabase Vault at boot. The DB never
 * sees plaintext PHI on these columns.
 */
export const bytea = customType<{ data: Uint8Array; driverData: Uint8Array }>({
  dataType() {
    return 'bytea';
  },
});
