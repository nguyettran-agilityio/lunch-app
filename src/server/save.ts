// Writes what a rule of `domain/logic.ts` changed (plan.md section 1.3, step 5, B24): it compares
// the State slice before and after and writes only the difference, per entity. First built in
// PR M1-5, for buildings only; PR M2-1 adds the dish groups and the dishes (the base price is
// written by its Server Action, which creates the settings row, B71); each milestone adds its entities.
import 'server-only'
import { eq, inArray } from 'drizzle-orm'
import { nameKey } from '@/domain/dishes'
import type { Building, Dish, DishGroup, State } from '@/domain/types'
import type { AnyDb } from '@/server/db/client'
import { buildings, dishGroups, dishes } from '@/server/db/schema'

const buildingColumns = (b: Building) => ({
  name: b.name,
  address: b.address,
  deliveryTime: b.deliveryTime,
  state: b.state,
  proposedBy: b.proposedBy,
})

const groupColumns = (g: DishGroup) => ({
  name: g.name,
  nameKey: nameKey(g.name),
  min: g.min,
  max: g.max,
  included: g.included,
  extraFee: g.extraFee,
  position: g.position,
})

const dishColumns = (d: Dish) => ({
  name: d.name,
  nameKey: nameKey(d.name),
  description: d.description,
  nameEn: d.nameEn ?? null,
  descriptionEn: d.descriptionEn ?? null,
  photoPath: d.photoPath,
  drawing: d.drawing,
  price: d.price,
  groupId: d.groupId,
  surcharge: d.surcharge,
  active: d.active,
})

const same = <T>(columns: (x: T) => object, a: T, b: T) => JSON.stringify(columns(a)) === JSON.stringify(columns(b))

/** Inserts the new rows, updates the changed ones and deletes the removed ones (no dish is ever deleted). */
export async function saveState(db: AnyDb, before: State, after: State): Promise<void> {
  const oldBuildings = new Map(before.buildings.map((b) => [b.id, b]))
  const nowBuildings = new Set(after.buildings.map((b) => b.id))
  for (const b of after.buildings) {
    const was = oldBuildings.get(b.id)
    if (!was) await db.insert(buildings).values({ id: b.id, ...buildingColumns(b) })
    else if (!same(buildingColumns, was, b)) await db.update(buildings).set(buildingColumns(b)).where(eq(buildings.id, b.id))
  }
  const goneBuildings = before.buildings.filter((b) => !nowBuildings.has(b.id)).map((b) => b.id)
  if (goneBuildings.length) await db.delete(buildings).where(inArray(buildings.id, goneBuildings))

  // Groups first, so a dish can point at a new group; deleted groups last, after the dishes moved.
  const oldGroups = new Map(before.groups.map((g) => [g.id, g]))
  const nowGroups = new Set(after.groups.map((g) => g.id))
  for (const g of after.groups) {
    const was = oldGroups.get(g.id)
    if (!was) await db.insert(dishGroups).values({ id: g.id, ...groupColumns(g) })
    else if (!same(groupColumns, was, g)) await db.update(dishGroups).set(groupColumns(g)).where(eq(dishGroups.id, g.id))
  }
  const oldDishes = new Map(before.dishes.map((d) => [d.id, d]))
  for (const d of after.dishes) {
    const was = oldDishes.get(d.id)
    if (!was) await db.insert(dishes).values({ id: d.id, ...dishColumns(d) })
    else if (!same(dishColumns, was, d)) await db.update(dishes).set(dishColumns(d)).where(eq(dishes.id, d.id))
  }
  const goneGroups = before.groups.filter((g) => !nowGroups.has(g.id)).map((g) => g.id)
  if (goneGroups.length) await db.delete(dishGroups).where(inArray(dishGroups.id, goneGroups))
}
