// Seeds the data of the test sign-in mode (B43, B44) into a PGlite that already has the
// migrations of drizzle/: the test-only tables, the approved building and the accounts.
// Used by scripts/e2e-server.mts and checked by __tests__/test-seed.test.ts.
import type { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { TEST_ACCOUNTS, TEST_BUILDING } from '../src/server/auth/test-accounts.ts'

export async function seedTestData(pg: PGlite) {
  await pg.exec(await readFile(path.join(import.meta.dirname, 'test-tables.sql'), 'utf8'))
  const b = TEST_BUILDING
  await pg.query('INSERT INTO buildings (id, name, address, state) VALUES ($1, $2, $3, $4)', [b.id, b.name, b.address, b.state])
  for (const a of Object.values(TEST_ACCOUNTS)) {
    await pg.query('INSERT INTO profiles (id, email, method, phone, name, building_id) VALUES ($1, $2, $3, $4, $5, $6)', [
      a.id,
      a.email,
      a.method,
      a.phone,
      a.name,
      a.buildingId,
    ])
  }
}
