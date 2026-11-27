// The State slice a rule of `domain/logic.ts` needs, built from the database (plan.md section
// 1.3, step 3, B24). First built in PR M1-5, for buildings only; each milestone adds its entities.
import 'server-only'
import { and, eq, or } from 'drizzle-orm'
import type { Building, Clock, Lang, State } from '@/domain/types'
import type { AnyDb } from '@/server/db/client'
import { buildings } from '@/server/db/schema'

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
  return {
    lang: ctx.lang,
    clock: ctx.clock,
    me: ctx.me,
    settings: { defaultCutoff: 0, bank: { name: '', account: '', holder: '' }, basePrice: 0 },
    groups: [],
    dishes: [],
    days: [],
    buildings: await loadBuildings(db, ctx.me),
    customers: [],
    orders: [],
    carts: {},
    refundReminderSeen: null,
  }
}
