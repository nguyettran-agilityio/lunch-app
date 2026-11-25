// @vitest-environment node
// The seed of the e2e server (B43, B44) on PGlite with the migrations of drizzle/.
import { afterEach, beforeEach, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { buildings, profiles } from '@/server/db/schema'
import { TEST_ACCOUNTS } from '@/server/auth/test-accounts'
import { seedTestData } from '../e2e/seed'
import { createTestDb, type TestDb } from './helpers/db'

let t: TestDb
beforeEach(async () => {
  t = await createTestDb()
  await seedTestData(t.pg)
})
afterEach(async () => {
  await t.close()
})

it('B44 BR-15 the seeded customer has a complete profile: name, phone and an approved building', async () => {
  const [row] = await t.db
    .select({ name: profiles.name, phone: profiles.phone, state: buildings.state })
    .from(profiles)
    .innerJoin(buildings, eq(buildings.id, profiles.buildingId))
    .where(eq(profiles.id, TEST_ACCOUNTS.customer.id))
  expect(row).toEqual({ name: TEST_ACCOUNTS.customer.name, phone: TEST_ACCOUNTS.customer.phone, state: 'approved' })
})

it('B43 B44 the shop account is seeded and test_sessions exists, outside drizzle/', async () => {
  const [shop] = await t.db.select({ email: profiles.email }).from(profiles).where(eq(profiles.id, TEST_ACCOUNTS.shop.id))
  expect(shop.email).toBe('shop@example.test')
  const { rows } = await t.pg.query<{ n: number }>('SELECT count(*)::int AS n FROM test_sessions')
  expect(rows[0].n).toBe(0)
})
