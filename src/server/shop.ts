// The shop's Dishes and Build-your-own rules, S-S1 and S-S2 (plan.md section 1.3 and the M2-1 plan,
// CN-80, CN-81, B71), with their database and storage passed in, so the tests run them on PGlite
// with the test storage. The Server Actions of `actions/shop.ts` check the shop role and call these.
import 'server-only'
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import * as rules from '@/domain/dishes'
import type { Clock, DishGroup, Lang } from '@/domain/types'
import { inTransaction, type AnyDb } from '@/server/db/client'
import { dishes, shopSettings } from '@/server/db/schema'
import { loadBasePrice, loadShopState } from '@/server/load'
import { saveState } from '@/server/save'
import type { StorageProvider } from '@/server/storage/provider'

export type ShopDeps = { db: AnyDb; storage: StorageProvider; ctx: { me: string; lang: Lang; clock: Clock } }

/** The largest photo the server accepts, after the browser shrank it (plan.md section 1.7). */
export const PHOTO_MAX_BYTES = 2 * 1024 * 1024

/** A path of a new dish photo: `dishes/<uuid>.jpg` (B71). */
const PHOTO_PATH = /^dishes\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/

/** How long a photo's signed address works (B71). */
export const PHOTO_URL_SECONDS = 60 * 60

/** The Postgres error code of a failed query (Drizzle keeps the driver's error as `cause`). */
function pgCode(e: unknown): string | undefined {
  const err = e as { code?: unknown; cause?: { code?: unknown } } | null
  const code = err?.code ?? err?.cause?.code
  return typeof code === 'string' ? code : undefined
}
const UNIQUE = '23505'
const FOREIGN_KEY = '23503'

/** A new upload address for a dish photo: a new path, made by the server (B71). */
export async function newPhotoUpload(storage: StorageProvider): Promise<{ path: string; url: string }> {
  const path = `dishes/${randomUUID()}.jpg`
  return { path, url: await storage.uploadUrl(path) }
}

/** Whether a new photo's path is one of ours and its file is an image of at most 2 MB (plan.md section 1.7). */
async function photoOk(storage: StorageProvider, path: string): Promise<boolean> {
  if (!PHOTO_PATH.test(path)) return false
  const info = await storage.info(path)
  return !!info && info.size > 0 && info.size <= PHOTO_MAX_BYTES && info.contentType.startsWith('image/')
}

export type DishAnswer = { ok: true; id: string } | { ok: false; fields: rules.DishErrors; reloadGroups?: boolean }

/**
 * Saves a dish (S-S1): the new photo is checked in the bucket first, the dish's row is locked, the
 * rules of `domain/dishes.ts` run on the latest data, and only what changed is written. Once saved,
 * the photo it replaced or removed is deleted from the bucket; a failed delete is ignored (B71).
 */
export async function saveDish(deps: ShopDeps, input: rules.DishInput): Promise<DishAnswer> {
  if (input.photo.kind === 'new' && !(await photoOk(deps.storage, input.photo.path))) return { ok: false, fields: { photo: 'photoUpload' } }
  let oldPhoto: string | null = null
  let answer: DishAnswer
  try {
    answer = await inTransaction(deps.db, async (tx) => {
      if (input.id) await tx.select({ id: dishes.id }).from(dishes).where(eq(dishes.id, input.id)).for('update')
      const before = await loadShopState(tx, deps.ctx)
      oldPhoto = before.dishes.find((d) => d.id === input.id)?.photoPath ?? null
      const r = rules.saveDish(before, input, () => randomUUID())
      if (!r.ok) return { ok: false as const, fields: r.fields, reloadGroups: r.reloadGroups }
      await saveState(tx, before, r.state)
      return { ok: true as const, id: r.id }
    })
  } catch (e) {
    // Two shop accounts saving the same name at once: the deferred unique constraint (B71).
    if (pgCode(e) === UNIQUE) return { ok: false, fields: { name: 'dishNameTaken' } }
    // Its group deleted on another device in between (CN-81, AC213).
    if (pgCode(e) === FOREIGN_KEY) return { ok: false, fields: { groupId: 'required' }, reloadGroups: true }
    throw e
  }
  if (answer.ok && oldPhoto && input.photo.kind !== 'keep') await deps.storage.remove([oldPhoto])
  return answer
}

/** "Stop selling" and "Sell again" (CN-80); not guarded by orders until M3 (AC63). */
export async function setDishActive(deps: ShopDeps, id: string, active: boolean): Promise<{ ok: boolean }> {
  return inTransaction(deps.db, async (tx) => {
    await tx.select({ id: dishes.id }).from(dishes).where(eq(dishes.id, id)).for('update')
    const before = await loadShopState(tx, deps.ctx)
    const r = rules.setDishActive(before, id, active)
    if (!r.ok) return { ok: false }
    await saveState(tx, before, r.state)
    return { ok: true }
  })
}

/** On success, the rules as saved: the screen shows them at once, also a group kept from another device (AC215). */
export type RulesAnswer =
  | { ok: true; basePrice: number; groups: DishGroup[] }
  | {
      ok: false
      fields: rules.RulesErrors
      /** When another device saved at the same moment: the latest rules, which the screen shows (CN-82, AC221). */
      latest?: { basePrice: number | null; groups: DishGroup[] }
    }

/**
 * Saves the Build-your-own rules (S-S2): the settings row is created if needed and locked (B71, plan
 * section 1.3), then the rules run on the latest data and one Save writes the base price and every
 * group, or nothing (CN-80, CN-81).
 */
export async function saveRules(deps: ShopDeps, input: rules.RulesInput): Promise<RulesAnswer> {
  try {
    return await inTransaction(deps.db, async (tx) => {
      await tx.insert(shopSettings).values({ id: true }).onConflictDoNothing()
      await tx.select({ id: shopSettings.id }).from(shopSettings).for('update')
      const before = await loadShopState(tx, deps.ctx)
      const r = rules.saveRules(before, input, () => randomUUID())
      if (!r.ok) return { ok: false as const, fields: r.fields }
      await saveState(tx, before, r.state)
      await tx.update(shopSettings).set({ basePrice: r.basePrice })
      return { ok: true as const, basePrice: r.basePrice, groups: r.state.groups }
    })
  } catch (e) {
    // A dish saved into a group this Save deletes, between this Save's read and its write (the
    // foreign key): nothing saved; the screen shows "This screen has just changed" with the latest
    // groups and base price, and the shop taps Save again (CN-82, AC221). The unique name key cannot
    // refuse a rules Save today, since rules Saves wait for each other on the settings row; it is
    // answered the same way rather than as an error page.
    const code = pgCode(e)
    if (code !== FOREIGN_KEY && code !== UNIQUE) throw e
    const [state, basePrice] = await Promise.all([loadShopState(deps.db, deps.ctx), loadBasePrice(deps.db)])
    return { ok: false, fields: { form: 'screenChanged' }, latest: { basePrice, groups: state.groups } }
  }
}

/** The dishes page's data: the State slice, the base price (null when never saved) and each photo's signed address. */
export async function dishesPage(deps: ShopDeps) {
  const state = await loadShopState(deps.db, deps.ctx)
  const paths = state.dishes.map((d) => d.photoPath).filter((p): p is string => !!p)
  const urls = await deps.storage.readUrls(paths, PHOTO_URL_SECONDS)
  return { state, photos: Object.fromEntries(urls) as Record<string, string> }
}
