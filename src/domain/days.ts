// The rules of the shop's Days and Settings screens, S-S3 and S-S4 (BR-2, BR-3, BR-4, CN-61, CN-62,
// CN-83, PR M2-2, B73): the 7 days, the cutoff of a day, typing a cutoff, the dishes a day lists and
// the menu customers see, the bank fields, and what one Save of a day or of the settings does. Pure
// functions: the server runs them on the latest data in its transaction, the screens use the same.
import type { SetupError } from './dishes'
import { addDays, hhmm } from './time'
import type { Clock, DateStr, Dish } from './types'

/** The default cutoff while the shop has never saved one: 09:30 (CN-83, B73). */
export const DEFAULT_CUTOFF = 9 * 60 + 30

/** The longest account holder, in characters (CN-83). */
export const HOLDER_MAX = 50

export type MenuKind = 'fixed' | 'component'
/** One line of a day's menu: a dish on sale that day as a ready meal or as a build-your-own dish (BR-2). */
export type MenuRow = { dishId: string; kind: MenuKind }

/** A service day as stored (plan.md section 2): its own cutoff, the default kept once past it (CN-61), and its menu. */
export type DayRow = { date: DateStr; cutoff: number | null; lockedCutoff: number | null; closed: boolean; menu: MenuRow[] }

/** The default cutoff in use: the one saved, or 09:30 while there is none (AC224). */
export const defaultCutoffOf = (saved: number | null): number => saved ?? DEFAULT_CUTOFF

/** Today and the next 6 days, the days of S-S3 and the days customers see (BR-3, CN-83, AC223). */
export function shopWeek(today: DateStr): DateStr[] {
  return Array.from({ length: 7 }, (_, i) => addDays(today, i))
}

/** A day's cutoff: its own, else the default kept when it passed (CN-61), else the default (BR-4). */
export const dayCutoff = (day: DayRow | undefined, defaultCutoff: number): number => day?.cutoff ?? day?.lockedCutoff ?? defaultCutoff

/**
 * Whether the day is past its cutoff: a day before today always, today once the minute of its
 * cutoff has begun (a cutoff equal to the current minute counts as reached, CN-83), a later day never.
 */
export function pastCutoff(clock: Clock, date: DateStr, cutoff: number): boolean {
  if (date < clock.today) return true
  if (date > clock.today) return false
  return clock.minutes >= cutoff
}

/** Characters that take no room on screen, which a Vietnamese input method can put in a field. */
const INVISIBLE = /[​-‍⁠﻿­‎‏‪-‮⁦-⁩]/g

/**
 * A cutoff typed as HH:MM in 24 hours (CN-83, AC231): "9:30", "09:30" and "0930" are 09:30; 00:00
 * to 23:59; anything else, "9h30", "9.30" and "930" included, is not a valid time.
 */
export function parseCutoff(raw: string): { value: number } | { error: 'required' | 'badTime' } {
  const s = raw.replace(INVISIBLE, '').trim()
  if (!s) return { error: 'required' }
  const m = /^(\d{1,2}):(\d{2})$/.exec(s) ?? /^(\d{2})(\d{2})$/.exec(s)
  if (!m) return { error: 'badTime' }
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return { error: 'badTime' }
  return { value: h * 60 + min }
}

/**
 * A cutoff field as the shop types it (CN-83): digits only get their ":" after the first two, so
 * "0930" typed on a phone's number keyboard shows "09:30" while typed; anything else ("9:30",
 * "9h30", a paste) is left as it is, and `parseCutoff` decides at Save.
 */
export function maskCutoff(raw: string): string {
  // More than 4 digits (a paste) is left as it is, so Save refuses it instead of cutting it (B75).
  if (!/^\d{1,4}$/.test(raw)) return raw
  return raw.length > 2 ? `${raw.slice(0, 2)}:${raw.slice(2)}` : raw
}

/** A cutoff as the screens show it: "09:30", in both languages (CN-83). */
export const formatCutoff = (minutes: number): string => hhmm(minutes)

/**
 * The menu customers see from a day's rows and the dishes as they are now (CN-83, AC222, AC234):
 * a dish no longer sold is left out; a ready-meal row counts only while the dish has a price, a
 * build-your-own row only while it has a group (shown in that group).
 */
export function visibleMenu(rows: MenuRow[], dishes: Dish[]): MenuRow[] {
  const byId = new Map(dishes.map((d) => [d.id, d]))
  return rows.filter((r) => {
    const d = byId.get(r.dishId)
    if (!d || !d.active) return false
    return r.kind === 'fixed' ? d.price !== null : d.groupId !== null
  })
}

/** A day whose rows give customers no dish counts as "no menu yet" (BR-3, CN-83, AC238). */
export const hasCustomerMenu = (rows: MenuRow[], dishes: Dish[]): boolean => visibleMenu(rows, dishes).length > 0

export type DayNote = 'notSold' | 'noFixed' | 'noComponent'

/** The notes of a dish on a day's form (CN-83, AC222, AC234): not sold, no longer a ready meal, no longer a build-your-own dish. */
export function dayNotes(dish: Dish, rows: MenuRow[]): DayNote[] {
  const on = (kind: MenuKind) => rows.some((r) => r.dishId === dish.id && r.kind === kind)
  const notes: DayNote[] = []
  if (!dish.active && rows.some((r) => r.dishId === dish.id)) notes.push('notSold')
  if (on('fixed') && dish.price === null) notes.push('noFixed')
  if (on('component') && dish.groupId === null) notes.push('noComponent')
  return notes
}

/**
 * The dishes a day's form lists (CN-83, AC226, AC237): the dishes being sold and the dishes already
 * on that day's menu, in one list by Vietnamese name A–Z.
 */
export function dayDishes(dishes: Dish[], rows: MenuRow[]): Dish[] {
  const onMenu = new Set(rows.map((r) => r.dishId))
  const collator = new Intl.Collator('vi')
  return dishes.filter((d) => d.active || onMenu.has(d.id)).sort((a, b) => collator.compare(a.name, b.name))
}

/** The number of dishes a day's card shows: each dish once, hidden ones included (CN-83, AC238). */
export const dishCount = (rows: MenuRow[]): number => new Set(rows.map((r) => r.dishId)).size

/** An account number (CN-83, AC225): spaces removed, digits only, 6 to 19 of them. */
export function readAccount(raw: string): { value: string } | { error: 'required' | 'accountDigits' } {
  const s = raw.replace(INVISIBLE, '').replace(/\s+/g, '')
  if (!s) return { error: 'required' }
  return /^\d{6,19}$/.test(s) ? { value: s } : { error: 'accountDigits' }
}

/**
 * An account holder (CN-83, AC225): NFC, trimmed at the start and end, at most 50 characters; its
 * letters become capital letters without accents ("đ" and "Đ" give "D"), other characters are kept:
 * "Quán Cơm Lá & Co" gives "QUAN COM LA & CO".
 */
export function readHolder(raw: string): { value: string } | { error: 'required' | 'holderTooLong' } {
  const s = raw.replace(INVISIBLE, '').normalize('NFC').trim()
  if (!s) return { error: 'required' }
  if (Array.from(s).length > HOLDER_MAX) return { error: 'holderTooLong' }
  const value = s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'D').toUpperCase().normalize('NFC')
  return { value }
}

/** What the day's form sends (S-S3): the ticks and the day's own cutoff, empty = the default (AC233). */
export type DayInput = { date: DateStr; fixed: string[]; components: string[]; cutoff: string; confirmed: boolean }
export type DayErrors = { cutoff?: SetupError; form?: SetupError }
export type DayResult =
  { ok: true; menu: MenuRow[]; cutoff: number | null } | { ok: false; closesToday: true } | { ok: false; fields: DayErrors }

/** The data one Save of a day runs on, read in the Save's transaction. */
export type DayContext = { clock: Clock; defaultCutoff: number; day: DayRow | undefined; dishes: Dish[] }

/**
 * One Save of a day (S-S3, BR-2, BR-4, CN-83): refused once the day is no longer among the 7 days
 * (AC236); a cutoff that is not a valid time is refused (AC231); after the day's cutoff, a changed
 * own cutoff refuses the whole Save, while the menu alone is saved (AC232, AC235). A Save that would
 * close today at once (today keeps a menu customers see, is not past its cutoff, and its new cutoff
 * is at or before the current minute) needs `confirmed` (AC228, AC238). The menu is the ticks as
 * sent, each dish once per kind, a dish not sold or of another kind included (AC222); the last Save
 * wins (AC229).
 */
export function saveDay(ctx: DayContext, input: DayInput): DayResult {
  const { clock, defaultCutoff, day, dishes } = ctx
  if (!shopWeek(clock.today).includes(input.date)) return { ok: false, fields: { form: 'dayPassed' } }
  let own: number | null = null
  if (input.cutoff.replace(INVISIBLE, '').trim()) {
    const r = parseCutoff(input.cutoff)
    if ('error' in r) return { ok: false, fields: { cutoff: r.error } }
    own = r.value
  }
  const past = pastCutoff(clock, input.date, dayCutoff(day, defaultCutoff))
  if (past && own !== (day?.cutoff ?? null)) return { ok: false, fields: { cutoff: 'pastCutoff' } }
  const known = new Set(dishes.map((d) => d.id))
  const menu: MenuRow[] = []
  const seen = new Set<string>()
  for (const [kind, ids] of [
    ['fixed', input.fixed],
    ['component', input.components],
  ] as const) {
    for (const dishId of ids) {
      const key = `${kind}:${dishId}`
      if (!known.has(dishId) || seen.has(key)) continue
      seen.add(key)
      menu.push({ dishId, kind })
    }
  }
  if (input.date === clock.today && !past && !input.confirmed) {
    const next = own ?? day?.lockedCutoff ?? defaultCutoff
    if (next <= clock.minutes && hasCustomerMenu(menu, dishes)) return { ok: false, closesToday: true }
  }
  return { ok: true, menu, cutoff: own }
}

/** What the Settings form sends (S-S4). */
export type SettingsInput = { defaultCutoff: string; bankBin: string; account: string; holder: string; confirmed: boolean }
export type SettingsField = 'defaultCutoff' | 'bankBin' | 'account' | 'holder'
export type SettingsErrors = Partial<Record<SettingsField, SetupError>>
export type SettingsValues = { defaultCutoff: number; bankBin: string; account: string; holder: string }
export type SettingsResult =
  | {
      ok: true
      values: SettingsValues
      /** Today's cutoff to keep, when the default changes while today uses it and is past it (CN-61). */
      lockToday: number | null
    }
  | { ok: false; closesToday: true }
  | { ok: false; fields: SettingsErrors }

/** The data one Save of the settings runs on: the default in use and today's row. */
export type SettingsContext = { clock: Clock; defaultCutoff: number; today: DayRow | undefined; dishes: Dish[]; banks: ReadonlySet<string> }

/**
 * One Save of the Settings screen (S-S4, BR-4, CN-61, CN-62, CN-83): every field required, the
 * cutoff a valid time, the bank one of the list, the account number 6–19 digits, the holder at most
 * 50 characters (AC225, AC231). A new default that would close today at once needs `confirmed`
 * (AC228); a new default while today uses the default and is past it keeps today's cutoff (AC79).
 */
export function saveSettings(ctx: SettingsContext, input: SettingsInput): SettingsResult {
  const fields: SettingsErrors = {}
  const cutoff = parseCutoff(input.defaultCutoff)
  if ('error' in cutoff) fields.defaultCutoff = cutoff.error
  if (!ctx.banks.has(input.bankBin)) fields.bankBin = 'required'
  const account = readAccount(input.account)
  if ('error' in account) fields.account = account.error
  const holder = readHolder(input.holder)
  if ('error' in holder) fields.holder = holder.error
  if ('error' in cutoff || 'error' in account || 'error' in holder || fields.bankBin) return { ok: false, fields }
  const values = { defaultCutoff: cutoff.value, bankBin: input.bankBin, account: account.value, holder: holder.value }
  let lockToday: number | null = null
  const today = ctx.today
  const usesDefault = today?.cutoff == null && today?.lockedCutoff == null
  if (usesDefault && values.defaultCutoff !== ctx.defaultCutoff) {
    if (ctx.clock.minutes >= ctx.defaultCutoff) lockToday = ctx.defaultCutoff
    else if (!input.confirmed && values.defaultCutoff <= ctx.clock.minutes && hasCustomerMenu(today?.menu ?? [], ctx.dishes))
      return { ok: false, closesToday: true }
  }
  return { ok: true, values, lockToday }
}
