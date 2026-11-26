// The server's database connection (B12): Drizzle with the `postgres` driver over the
// Supabase pooler in transaction mode, so prepared statements are off. Server only.
// The connection is opened on first use, so building the app needs no DATABASE_URL.
import 'server-only'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { isTestMode } from '@/server/auth/test-mode'
import * as schema from './schema'

export type Db = PostgresJsDatabase<typeof schema>
/** Any Drizzle database with these tables: the postgres connection, or PGlite in tests. */
export type AnyDb = PgDatabase<PgQueryResultHKT, typeof schema>

// One connection pool for the whole server process: Next bundles this module into several
// chunks (pages, routes, actions), and each would otherwise open its own.
const shared = globalThis as typeof globalThis & { __lunchDb?: Db }

export function getDb(): Db {
  if (!shared.__lunchDb) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL is not set')
    // The e2e server's PGlite (pglite-socket) queues each protocol message, so statements of
    // two connections querying at the same moment get mixed up: the test mode uses one.
    shared.__lunchDb = drizzle(postgres(url, { prepare: false, ...(isTestMode() ? { max: 1 } : {}) }), { schema })
  }
  return shared.__lunchDb
}
