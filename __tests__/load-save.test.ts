// @vitest-environment node
// The first `server/load.ts` and `server/save.ts` (plan.md section 1.3, B24), for buildings only,
// on PGlite: the buildings a customer may see, and proposing one through `logic.proposeBuilding`.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { proposeBuilding } from '@/domain/logic'
import { buildings, profiles } from '@/server/db/schema'
import { createTestDb, type TestDb } from './helpers/db'

vi.mock('server-only', () => ({}))
const { loadBuildings, loadProfileState } = await import('@/server/load')
const { saveState } = await import('@/server/save')

const LAN = '00000000-0000-4000-8000-000000000001'
const HUY = '00000000-0000-4000-8000-000000000002'
const CLOCK = { today: '2026-11-27', minutes: 600 }

let t: TestDb
beforeEach(async () => {
  t = await createTestDb()
  await t.db.insert(profiles).values([
    { id: LAN, email: 'lan@gmail.com', method: 'password' },
    { id: HUY, email: 'huy@gmail.com', method: 'password' },
  ])
  await t.db.insert(buildings).values([
    { name: 'Tòa A', state: 'approved' },
    { name: 'Tòa Lan', state: 'pending', proposedBy: LAN },
    { name: 'Tòa Huy', state: 'pending', proposedBy: HUY },
    { name: 'Tòa cũ', state: 'declined', proposedBy: LAN },
  ])
})
afterEach(async () => {
  await t.close()
})

describe('load.ts and save.ts for buildings (B24)', () => {
  it('AC188 a customer sees the approved buildings and their own pending ones, never a declined one', async () => {
    expect((await loadBuildings(t.db, LAN)).map((b) => b.name)).toEqual(['Tòa A', 'Tòa Lan'])
    expect((await loadBuildings(t.db, HUY)).map((b) => b.name)).toEqual(['Tòa A', 'Tòa Huy'])
  })

  it('AC183 AC189 K13 K19 a proposal is one new row; the same name again writes nothing', async () => {
    const before = await loadProfileState(t.db, { me: LAN, lang: 'vi', clock: CLOCK })
    const r = proposeBuilding(before, 'Tòa ABC', '', () => '00000000-0000-4000-8000-0000000000c1')
    if (!r.ok) throw new Error(r.error)
    await saveState(t.db, before, r.state)
    const [row] = await t.db.select().from(buildings).where(eq(buildings.id, '00000000-0000-4000-8000-0000000000c1'))
    expect(row).toMatchObject({ name: 'Tòa ABC', address: '', state: 'pending', proposedBy: LAN })
    const after = await loadProfileState(t.db, { me: LAN, lang: 'vi', clock: CLOCK })
    const again = proposeBuilding(after, 'TÒA ABC', '', () => 'unused')
    if (!again.ok) throw new Error(again.error)
    await saveState(t.db, after, again.state)
    expect(again.id).toBe(row.id)
    expect(await t.db.select().from(buildings)).toHaveLength(5)
  })
})
