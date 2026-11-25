// The PGlite test helper (B19): an in-memory Postgres with the same migrations of drizzle/
// that `npm run db:migrate` applies to Supabase.
import { PGlite } from '@electric-sql/pglite'
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import path from 'node:path'
import * as schema from '@/server/db/schema'

export type TestDb = { db: PgliteDatabase<typeof schema>; pg: PGlite; close: () => Promise<void> }

export async function createTestDb(): Promise<TestDb> {
  const pg = new PGlite()
  const db = drizzle(pg, { schema })
  await migrate(db, { migrationsFolder: path.resolve(__dirname, '..', '..', 'drizzle') })
  return { db, pg, close: () => pg.close() }
}
