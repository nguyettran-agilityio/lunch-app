// Pure rules of the shop's Dishes and Build-your-own rules screens, S-S1 and S-S2 (BR-1, BR-6a,
// BR-7, CN-60, CN-61, CN-80, CN-81, the M2-1 plan in docs/plan.md). No I/O: the Server Actions of
// `server/actions/shop.ts` load the State slice, run these functions and save what changed (B24).
import type { Dish, DishGroup, Lang, NewId, State } from './types'

/** A message under one field of S-S1 or S-S2. The texts are in i18n.ts (`shopSetup.field`). */
export type SetupError =
  | 'required'
  | 'notWhole'
  | 'moneyTooBig'
  | 'countTooBig'
  | 'nameTooLong'
  | 'descriptionTooLong'
  | 'groupNameTooLong'
  | 'dishNameTaken'
  | 'groupNameTaken'
  | 'kindRequired'
  | 'maxBelowOne'
  | 'minOverMax'
  | 'includedOverMax'
  | 'includedUnderMin'
  | 'groupHasDishes'
  | 'photoUpload'
  // Another device saved at the same moment and the database refused this Save (CN-82, AC221).
  | 'screenChanged'

/**
 * The keys of the drawing set of components/art.tsx (BR-6a, B71): a dish's drawing is one of
 * them or none; a test keeps this list the same as the set.
 */
export const DRAWING_KEYS = [
  'd-suon',
  'd-thitkho',
  'd-cakho',
  'd-trung',
  'd-ga',
  'd-dauhu',
  'd-raumuong',
  'd-caithia',
  'd-susu',
  'd-canhchua',
  'd-canhbi',
  'd-bunbo',
  'd-comga',
  'd-buncha',
] as const

const isDrawing = (key: string | null): key is string => !!key && (DRAWING_KEYS as readonly string[]).includes(key)

/** At most 80 characters for a dish name, as the customer's name (CN-80). */
export const DISH_NAME_MAX = 80
export const DESCRIPTION_MAX = 200
export const GROUP_NAME_MAX = 40
/** Money at most 10,000,000 VND, counts at most 20 (CN-81). */
export const MONEY_MAX = 10_000_000
export const COUNT_MAX = 20

/** A name as stored: Unicode NFC, the spaces at its start and end removed; inner spaces count (CN-81). */
export const cleanName = (raw: string): string => raw.normalize('NFC').trim()

/**
 * The key two names are compared by (CN-80, CN-81, B71): NFC, trimmed, lower case. Computed here,
 * not by the database, so it does not depend on the database's locale; `name_key` stores it.
 */
export const nameKey = (raw: string): string => cleanName(raw).toLowerCase()

const length = (s: string) => Array.from(s).length

/**
 * An amount or a count typed by the shop (CN-80, CN-81): digits, or groups of three digits split
 * by one kind of separator. Dots and spaces in Vietnamese, commas and spaces in English; the other
 * language's separator counts too when exactly three digits follow it, so "45.000", "45,000",
 * "45 000" and "45000" are all 45,000, and "45,5" or "45.5" are refused in both languages.
 */
export function parseWhole(raw: string): { value: number } | { error: 'required' | 'notWhole' } {
  const s = raw.replace(/[  ]/g, ' ').trim()
  if (!s) return { error: 'required' }
  if (/^\d+$/.test(s)) return { value: Number(s) }
  const grouped = s.match(/^\d{1,3}(?:([ .,])\d{3})(?:\1\d{3})*$/)
  if (!grouped) return { error: 'notWhole' }
  return { value: Number(s.replace(/[ .,]/g, '')) }
}

function readMoney(raw: string): { value: number } | { error: SetupError } {
  const r = parseWhole(raw)
  if ('error' in r) return r
  return r.value > MONEY_MAX ? { error: 'moneyTooBig' } : r
}

function readCount(raw: string): { value: number } | { error: SetupError } {
  const r = parseWhole(raw)
  if ('error' in r) return r
  return r.value > COUNT_MAX ? { error: 'countTooBig' } : r
}

/** An amount or a count as the field shows it after saving, in the format of the language (CN-81). */
export const formatWhole = (v: number, lang: Lang): string => new Intl.NumberFormat(lang === 'vi' ? 'vi-VN' : 'en-US').format(v)

/** The order of the Dishes screen (CN-80, CN-81): sold dishes by Vietnamese name A–Z, then the others A–Z. */
export function dishOrder(dishes: Dish[]): Dish[] {
  const collator = new Intl.Collator('vi')
  return [...dishes].sort((a, b) => Number(b.active) - Number(a.active) || collator.compare(a.name, b.name))
}

/** What the shop typed in the dish form (S-S1). */
export type DishInput = {
  /** Null for a new dish. */
  id: string | null
  name: string
  description: string
  nameEn: string
  descriptionEn: string
  fixed: boolean
  price: string
  component: boolean
  groupId: string
  surcharge: string
  drawing: string | null
  /** The photo: kept as it is, removed, or a new upload (its path in the bucket). */
  photo: { kind: 'keep' } | { kind: 'remove' } | { kind: 'new'; path: string }
}

export type DishField = 'name' | 'description' | 'nameEn' | 'descriptionEn' | 'kind' | 'price' | 'groupId' | 'surcharge' | 'photo'
export type DishErrors = Partial<Record<DishField, SetupError>>

export type SetupResult<E> = { ok: true; state: State; id: string } | { ok: false; fields: E; reloadGroups?: boolean }

function optional(raw: string, max: number, error: SetupError): { value: string } | { error: SetupError } {
  const v = raw.normalize('NFC').trim()
  return length(v) > max ? { error } : { value: v }
}

/**
 * Saves a dish (S-S1): every field is checked first and any refusal saves nothing (CN-80). The new
 * photo's path is checked by the Server Action against the bucket before this runs.
 */
export function saveDish(s: State, input: DishInput, newId: NewId): SetupResult<DishErrors> {
  const fields: DishErrors = {}
  const was = input.id ? s.dishes.find((d) => d.id === input.id) : undefined
  const name = cleanName(input.name)
  if (!name) fields.name = 'required'
  else if (length(name) > DISH_NAME_MAX) fields.name = 'nameTooLong'
  else if (s.dishes.some((d) => d.id !== input.id && nameKey(d.name) === nameKey(name))) fields.name = 'dishNameTaken'
  const description = optional(input.description, DESCRIPTION_MAX, 'descriptionTooLong')
  if ('error' in description) fields.description = description.error
  const nameEn = optional(input.nameEn, DISH_NAME_MAX, 'nameTooLong')
  if ('error' in nameEn) fields.nameEn = nameEn.error
  const descriptionEn = optional(input.descriptionEn, DESCRIPTION_MAX, 'descriptionTooLong')
  if ('error' in descriptionEn) fields.descriptionEn = descriptionEn.error
  if (!input.fixed && !input.component) fields.kind = 'kindRequired'
  let price: number | null = null
  if (input.fixed) {
    const r = readMoney(input.price)
    if ('error' in r) fields.price = r.error
    else price = r.value
  }
  let groupId: string | null = null
  let surcharge = 0
  let reloadGroups = false
  if (input.component) {
    if (!input.groupId) fields.groupId = 'required'
    else if (!s.groups.some((g) => g.id === input.groupId)) {
      // Deleted on another device while the form was open (CN-81, AC213).
      fields.groupId = 'required'
      reloadGroups = true
    } else groupId = input.groupId
    const r = readMoney(input.surcharge)
    if ('error' in r) fields.surcharge = r.error
    else surcharge = r.value
  }
  if (Object.keys(fields).length) return { ok: false, fields, reloadGroups }
  const photoPath = input.photo.kind === 'keep' ? (was?.photoPath ?? null) : input.photo.kind === 'remove' ? null : input.photo.path
  const dish: Dish = {
    id: was?.id ?? newId('d'),
    name,
    description: 'value' in description ? description.value : '',
    ...('value' in nameEn && nameEn.value ? { nameEn: nameEn.value } : {}),
    ...('value' in descriptionEn && descriptionEn.value ? { descriptionEn: descriptionEn.value } : {}),
    price,
    groupId,
    surcharge,
    photoPath,
    // Only a drawing of the set; anything else is none, a plain rice bowl (BR-6a).
    drawing: isDrawing(input.drawing) ? input.drawing : null,
    active: was?.active ?? true,
  }
  const dishes = was ? s.dishes.map((d) => (d.id === dish.id ? dish : d)) : [...s.dishes, dish]
  return { ok: true, state: { ...s, dishes }, id: dish.id }
}

/** "Stop selling" and "Sell again" (CN-80); the guard against active orders comes in M3 (AC63). */
export function setDishActive(s: State, id: string, active: boolean): { ok: true; state: State } | { ok: false } {
  if (!s.dishes.some((d) => d.id === id)) return { ok: false }
  return { ok: true, state: { ...s, dishes: s.dishes.map((d) => (d.id === id ? { ...d, active } : d)) } }
}

/** One group of the Build-your-own rules screen as typed; `id` null for a group added on the screen. */
export type GroupInput = { id: string | null; name: string; min: string; max: string; included: string; extraFee: string }

/** What one Save of S-S2 sends: the base price, the groups shown in their order, and the groups deleted on the screen. */
export type RulesInput = { basePrice: string; groups: GroupInput[]; deleted: string[] }

export type GroupField = 'name' | 'min' | 'max' | 'included' | 'extraFee' | 'row'
export type RulesErrors = {
  basePrice?: SetupError
  /** By the index of the group in `groups`. */
  groups?: Record<number, Partial<Record<GroupField, SetupError>>>
  /** A group deleted on the screen that still has dishes, by its id (CN-80, AC198). */
  deleted?: Record<string, SetupError>
  /** About the whole Save: another device changed the groups at the same moment (the database refused). */
  form?: SetupError
}

/**
 * Saves the Build-your-own rules (S-S2, BR-7, CN-80, CN-81): one Save for the whole screen, which
 * saves nothing when a field is refused. The last Save wins over another device (AC209): a group
 * the screen did not show is deleted, except one that now has a dish, which stays after the shown
 * groups (AC215). A group deleted on the screen that still has a dish, also one no longer sold, is
 * refused (AC198).
 */
export function saveRules(
  s: State,
  input: RulesInput,
  newId: NewId,
): { ok: true; state: State; basePrice: number } | { ok: false; fields: RulesErrors } {
  const fields: RulesErrors = {}
  const base = readMoney(input.basePrice)
  if ('error' in base) fields.basePrice = base.error
  const hasDish = (id: string) => s.dishes.some((d) => d.groupId === id)
  const groups: DishGroup[] = []
  const keys = new Map<string, number>()
  input.groups.forEach((g, i) => {
    const e: Partial<Record<GroupField, SetupError>> = {}
    const name = cleanName(g.name)
    if (!name) e.name = 'required'
    else if (length(name) > GROUP_NAME_MAX) e.name = 'groupNameTooLong'
    else if (keys.has(nameKey(name))) e.name = 'groupNameTaken'
    else keys.set(nameKey(name), i)
    const min = readCount(g.min)
    const max = readCount(g.max)
    const included = readCount(g.included)
    const fee = readMoney(g.extraFee)
    if ('error' in min) e.min = min.error
    if ('error' in max) e.max = max.error
    else if (max.value < 1) e.max = 'maxBelowOne'
    if ('error' in included) e.included = included.error
    if ('error' in fee) e.extraFee = fee.error
    if ('value' in min && 'value' in max && !e.max && min.value > max.value) e.min = 'minOverMax'
    if ('value' in included && 'value' in max && !e.max && included.value > max.value) e.included = 'includedOverMax'
    else if ('value' in included && 'value' in min && !e.min && included.value < min.value) e.included = 'includedUnderMin'
    if (g.id && !s.groups.some((x) => x.id === g.id)) {
      // Deleted on another device: the last Save wins, so it is added again as a new group.
      g = { ...g, id: null }
    }
    if (Object.keys(e).length) {
      fields.groups = { ...fields.groups, [i]: e }
      return
    }
    groups.push({
      id: g.id ?? newId('g'),
      name,
      min: (min as { value: number }).value,
      max: (max as { value: number }).value,
      included: (included as { value: number }).value,
      extraFee: (fee as { value: number }).value,
      position: 0,
    })
  })
  for (const id of input.deleted)
    if (s.groups.some((g) => g.id === id) && hasDish(id)) fields.deleted = { ...fields.deleted, [id]: 'groupHasDishes' }
  // A name kept from a group the screen did not show also counts (AC215).
  const shown = new Set(input.groups.map((g) => g.id).filter(Boolean))
  const kept = s.groups.filter((g) => !shown.has(g.id) && !input.deleted.includes(g.id) && hasDish(g.id))
  input.groups.forEach((g, i) => {
    const k = nameKey(g.name)
    if (k && kept.some((x) => nameKey(x.name) === k) && !fields.groups?.[i]?.name)
      fields.groups = { ...fields.groups, [i]: { ...fields.groups?.[i], name: 'groupNameTaken' } }
  })
  if (Object.keys(fields).length) return { ok: false, fields }
  const all = [...groups, ...kept].map((g, position) => ({ ...g, position }))
  return {
    ok: true,
    state: { ...s, groups: all, settings: { ...s.settings, basePrice: (base as { value: number }).value } },
    basePrice: (base as { value: number }).value,
  }
}
