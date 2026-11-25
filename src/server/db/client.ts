// The server's database connection (B12): Drizzle with the `postgres` driver over the
// Supabase pooler in transaction mode, so prepared statements are off. Server only.
// The connection is opened on first use, so building the app needs no DATABASE_URL.
import 'server-only'
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

export type Db = PostgresJsDatabase<typeof schema>

let db: Db | undefined

export function getDb(): Db {
  if (!db) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL is not set')
    db = drizzle(postgres(url, { prepare: false }), { schema })
  }
  return db
}
