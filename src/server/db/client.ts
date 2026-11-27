// The server's database connection (B12): Drizzle with the `postgres` driver over the
// Supabase pooler in transaction mode, so prepared statements are off. Server only.
// The connection is opened on first use, so building the app needs no DATABASE_URL.
import 'server-only'
import { AsyncLocalStorage } from 'node:async_hooks'
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

// The transaction running in this request, if any (`inTransaction`): code that reaches the
// database through `getDb()` while it runs, for example the sign-in service's provider, uses it
// too. Without that, a second statement would wait for the one connection of the test mode
// (below) that the transaction holds, and in production it would run outside the transaction.
const current = new AsyncLocalStorage<AnyDb>()

/** Runs `work` in a transaction of `db`, which `getDb()` gives while it runs. */
export function inTransaction<T>(db: AnyDb, work: (tx: AnyDb) => Promise<T>): Promise<T> {
  return db.transaction((tx) => current.run(tx, () => work(tx)))
}

export function getDb(): Db {
  const tx = current.getStore()
  // The same tables and calls; the type differs only by its driver.
  if (tx) return tx as unknown as Db
  if (!shared.__lunchDb) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL is not set')
    // The e2e server's PGlite (pglite-socket) queues each protocol message, so statements of
    // two connections querying at the same moment get mixed up: the test mode uses one.
    shared.__lunchDb = drizzle(postgres(url, { prepare: false, ...(isTestMode() ? { max: 1 } : {}) }), { schema })
  }
  return shared.__lunchDb
}
