// The State slice a rule of `domain/logic.ts` needs, built from the database (plan.md section
// 1.3, step 3, B24). First built in PR M1-5, for buildings only; PR M2-1 adds the dish groups,
// the dishes and the shop settings; each milestone adds its entities.
import 'server-only'
import { and, asc, eq, inArray, or } from 'drizzle-orm'
import type { DayRow } from '@/domain/days'
import type { Building, Clock, DateStr, Dish, DishGroup, Lang, State } from '@/domain/types'
import type { AnyDb } from '@/server/db/client'
import { buildings, dayMenu, dishGroups, dishes, serviceDays, shopSettings } from '@/server/db/schema'

export const toGroup = (r: typeof dishGroups.$inferSelect): DishGroup => ({
  id: r.id,
  name: r.name,
  min: r.min,
  max: r.max,
  included: r.included,
  extraFee: r.extraFee,
  position: r.position,
})

export const toDish = (r: typeof dishes.$inferSelect): Dish => ({
  id: r.id,
  name: r.name,
  description: r.description,
  ...(r.nameEn ? { nameEn: r.nameEn } : {}),
  ...(r.descriptionEn ? { descriptionEn: r.descriptionEn } : {}),
  price: r.price,
  groupId: r.groupId,
  surcharge: r.surcharge,
  photoPath: r.photoPath,
  drawing: r.drawing,
  active: r.active,
})

/** The shop's base price, or null while the settings row does not exist yet (B71). */
export async function loadBasePrice(db: AnyDb): Promise<number | null> {
  const [row] = await db.select({ basePrice: shopSettings.basePrice }).from(shopSettings)
  return row?.basePrice ?? null
}

/**
 * A State with the dish groups (in their order), every dish and the base price filled: what the
 * rules of the Dishes and Build-your-own rules screens need (S-S1, S-S2, B24). The base price is 0
 * while it is not set; the page reads it with `loadBasePrice` to show an empty field.
 */
export async function loadShopState(db: AnyDb, ctx: { me: string; lang: Lang; clock: Clock }): Promise<State> {
  const [groups, rows, basePrice] = await Promise.all([
    db.select().from(dishGroups).orderBy(asc(dishGroups.position)),
    db.select().from(dishes),
    loadBasePrice(db),
  ])
  return {
    ...emptyState(ctx),
    settings: { defaultCutoff: 0, bank: { name: '', account: '', holder: '' }, basePrice: basePrice ?? 0 },
    groups: groups.map(toGroup),
    dishes: rows.map(toDish),
  }
}

/** The settings of S-S4 as saved (PR M2-2); every value null while not saved yet (B73). */
export type SavedSettings = { defaultCutoff: number | null; bankBin: string | null; bankAccount: string | null; bankHolder: string | null }

export async function loadSettings(db: AnyDb): Promise<SavedSettings> {
  const [row] = await db
    .select({
      defaultCutoff: shopSettings.defaultCutoff,
      bankBin: shopSettings.bankBin,
      bankAccount: shopSettings.bankAccount,
      bankHolder: shopSettings.bankHolder,
    })
    .from(shopSettings)
  return row ?? { defaultCutoff: null, bankBin: null, bankAccount: null, bankHolder: null }
}

/** The stored rows of these days with their menus (S-S3, PR M2-2); a day with no row is not in the list. */
export async function loadDays(db: AnyDb, dates: DateStr[]): Promise<DayRow[]> {
  if (dates.length === 0) return []
  const [days, menus] = await Promise.all([
    db.select().from(serviceDays).where(inArray(serviceDays.date, dates)),
    db.select().from(dayMenu).where(inArray(dayMenu.date, dates)),
  ])
  return days.map((d) => ({
    date: d.date,
    cutoff: d.cutoff,
    lockedCutoff: d.lockedCutoff,
    closed: d.closed,
    menu: menus.filter((r) => r.date === d.date).map((r) => ({ dishId: r.dishId, kind: r.kind })),
  }))
}

/** Every dish, for the Days screen and its rules (PR M2-2). */
export async function loadDishes(db: AnyDb): Promise<Dish[]> {
  return (await db.select().from(dishes)).map(toDish)
}

function emptyState(ctx: { me: string; lang: Lang; clock: Clock }): State {
  return {
    lang: ctx.lang,
    clock: ctx.clock,
    me: ctx.me,
    settings: { defaultCutoff: 0, bank: { name: '', account: '', holder: '' }, basePrice: 0 },
    groups: [],
    dishes: [],
    days: [],
    buildings: [],
    customers: [],
    orders: [],
    carts: {},
    refundReminderSeen: null,
  }
}

type Row = typeof buildings.$inferSelect

export const toBuilding = (r: Row): Building => ({
  id: r.id,
  name: r.name,
  address: r.address,
  deliveryTime: r.deliveryTime,
  // Earlier delivery times are kept from M2 (BR-18); none in M1.
  past: [],
  state: r.state,
  proposedBy: r.proposedBy,
})

/**
 * The buildings a customer may see and pick (BR-16, CN-25, CN-78): the approved ones, and the
 * pending ones they proposed. A declined building is left out, also their own default (AC188).
 */
export async function loadBuildings(db: AnyDb, me: string): Promise<Building[]> {
  const rows = await db
    .select()
    .from(buildings)
    .where(or(eq(buildings.state, 'approved'), and(eq(buildings.state, 'pending'), eq(buildings.proposedBy, me))))
    .orderBy(buildings.name)
  return rows.map(toBuilding)
}

/** A State with only the buildings filled: what the profile's rules need (B24, B29). */
export async function loadProfileState(db: AnyDb, ctx: { me: string; lang: Lang; clock: Clock }): Promise<State> {
  return { ...emptyState(ctx), buildings: await loadBuildings(db, ctx.me) }
}
