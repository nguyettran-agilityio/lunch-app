'use server'
// Server Actions of the shop's Dishes and Build-your-own rules screens, S-S1 and S-S2 (plan.md
// section 1.3, the M2-1 plan, B71): each checks the shop role first, then calls `server/shop.ts`
// and refreshes the page.
import { refresh } from 'next/cache'
import type { DishInput, RulesInput } from '@/domain/dishes'
import { getAuthProvider } from '@/server/auth/provider'
import { now } from '@/server/clock'
import { getDb } from '@/server/db/client'
import { getLang } from '@/server/session'
import * as shop from '@/server/shop'
import { getStorage } from '@/server/storage/provider'

/** The deps of a shop action, or null when the account signed in is not a shop account. */
async function shopDeps(): Promise<shop.ShopDeps | null> {
  const user = await (await getAuthProvider()).getUser()
  if (!user || user.role !== 'shop') return null
  const [storage, lang, clock] = await Promise.all([getStorage(), getLang(), now()])
  return { db: getDb(), storage, ctx: { me: user.id, lang, clock } }
}

/** A new path in the bucket and the address the browser uploads the shrunk photo to (B71). */
export async function createDishPhotoUploadAction(): Promise<{ ok: true; path: string; url: string } | { ok: false }> {
  const deps = await shopDeps()
  if (!deps) return { ok: false }
  return { ok: true, ...(await shop.newPhotoUpload(deps.storage)) }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** The shape of what the dish form sends: a Server Action can be called with anything. */
function isDishInput(v: unknown): v is DishInput {
  const d = v as Record<string, unknown> | null
  if (!d || typeof d !== 'object') return false
  const strings = ['name', 'description', 'nameEn', 'descriptionEn', 'price', 'groupId', 'surcharge'].every((k) => typeof d[k] === 'string')
  const photo = d.photo as { kind?: unknown; path?: unknown } | null
  const photoOk = !!photo && (photo.kind === 'keep' || photo.kind === 'remove' || (photo.kind === 'new' && typeof photo.path === 'string'))
  return (
    strings &&
    photoOk &&
    typeof d.fixed === 'boolean' &&
    typeof d.component === 'boolean' &&
    (d.id === null || (typeof d.id === 'string' && UUID.test(d.id))) &&
    (d.drawing === null || typeof d.drawing === 'string')
  )
}

function isRulesInput(v: unknown): v is RulesInput {
  const r = v as Record<string, unknown> | null
  if (!r || typeof r !== 'object' || typeof r.basePrice !== 'string' || !Array.isArray(r.groups) || !Array.isArray(r.deleted)) return false
  const groupOk = (g: Record<string, unknown>) =>
    (g.id === null || typeof g.id === 'string') && ['name', 'min', 'max', 'included', 'extraFee'].every((k) => typeof g[k] === 'string')
  return r.groups.every((g) => !!g && typeof g === 'object' && groupOk(g)) && r.deleted.every((x) => typeof x === 'string')
}

export async function saveDishAction(input: DishInput): Promise<shop.DishAnswer> {
  const deps = await shopDeps()
  if (!deps || !isDishInput(input)) return { ok: false, fields: {} }
  const r = await shop.saveDish(deps, input)
  // Also after a group deleted in between, so the form gets the latest groups (AC213).
  if (r.ok || r.reloadGroups) refresh()
  return r
}

export async function setDishActiveAction(id: string, active: boolean): Promise<{ ok: boolean }> {
  const deps = await shopDeps()
  if (!deps || typeof id !== 'string' || !UUID.test(id) || typeof active !== 'boolean') return { ok: false }
  const r = await shop.setDishActive(deps, id, active)
  if (r.ok) refresh()
  return r
}

export async function saveRulesAction(input: RulesInput): Promise<shop.RulesAnswer> {
  const deps = await shopDeps()
  if (!deps || !isRulesInput(input)) return { ok: false, fields: {} }
  const r = await shop.saveRules(deps, input)
  if (r.ok || r.fields.form) refresh()
  return r
}
