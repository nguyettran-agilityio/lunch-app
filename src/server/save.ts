// Writes what a rule of `domain/logic.ts` changed (plan.md section 1.3, step 5, B24): it compares
// the State slice before and after and writes only the difference, per entity. First built in
// PR M1-5, for buildings only; each milestone adds its entities.
import 'server-only'
import { eq, inArray } from 'drizzle-orm'
import type { Building, State } from '@/domain/types'
import type { AnyDb } from '@/server/db/client'
import { buildings } from '@/server/db/schema'

const columns = (b: Building) => ({
  name: b.name,
  address: b.address,
  deliveryTime: b.deliveryTime,
  state: b.state,
  proposedBy: b.proposedBy,
})

const same = (a: Building, b: Building) => JSON.stringify(columns(a)) === JSON.stringify(columns(b))

/** Inserts the new buildings, updates the changed ones and deletes the removed ones. */
export async function saveState(db: AnyDb, before: State, after: State): Promise<void> {
  const old = new Map(before.buildings.map((b) => [b.id, b]))
  const now = new Set(after.buildings.map((b) => b.id))
  for (const b of after.buildings) {
    const was = old.get(b.id)
    if (!was) await db.insert(buildings).values({ id: b.id, ...columns(b) })
    else if (!same(was, b)) await db.update(buildings).set(columns(b)).where(eq(buildings.id, b.id))
  }
  const gone = before.buildings.filter((b) => !now.has(b.id)).map((b) => b.id)
  if (gone.length) await db.delete(buildings).where(inArray(buildings.id, gone))
}
