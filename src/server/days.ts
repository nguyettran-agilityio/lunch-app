// The shop's Days and Settings screens, S-S3 and S-S4 (plan.md section 1.3 and the M2-2 plan,
// CN-83, B73), with their database passed in, so the tests run them on PGlite. The Server Actions
// of `actions/shop.ts` check the shop role and call these.
import 'server-only'
import { eq } from 'drizzle-orm'
import { BANKS } from '@/domain/banks'
import * as rules from '@/domain/days'
import type { Clock, DateStr, Dish } from '@/domain/types'
import { inTransaction, type AnyDb } from '@/server/db/client'
import { dayMenu, serviceDays, shopSettings } from '@/server/db/schema'
import { loadDays, loadDishes, loadSettings, type SavedSettings } from '@/server/load'

export type DaysDeps = { db: AnyDb; clock: Clock }

const BANK_BINS: ReadonlySet<string> = new Set(BANKS.map((b) => b.bin))

/** The Days page's data (S-S3): the 7 days with their stored rows, every dish and the default in use. */
export async function daysPage(deps: DaysDeps): Promise<{ week: DateStr[]; days: rules.DayRow[]; dishes: Dish[]; defaultCutoff: number }> {
  const week = rules.shopWeek(deps.clock.today)
  const [days, dishes, settings] = await Promise.all([loadDays(deps.db, week), loadDishes(deps.db), loadSettings(deps.db)])
  return { week, days, dishes, defaultCutoff: rules.defaultCutoffOf(settings.defaultCutoff) }
}

export type DayAnswer =
  | { ok: true; day: rules.DayRow }
  | { ok: false; closesToday: true }
  | {
      ok: false
      fields: rules.DayErrors
      /** The day as stored, sent back when the cutoff was refused after the cutoff (AC235). */
      saved?: rules.DayRow
    }

/**
 * Saves a day (S-S3, B73): the day's row is created if there is none and locked, the rules of
 * `domain/days.ts` run on the latest data, then every menu row of that date is replaced, in one
 * transaction. The last Save wins (AC229).
 */
export async function saveDay(deps: DaysDeps, input: rules.DayInput): Promise<DayAnswer> {
  if (!rules.shopWeek(deps.clock.today).includes(input.date)) return { ok: false, fields: { form: 'dayPassed' } }
  return inTransaction(deps.db, async (tx) => {
    await tx.insert(serviceDays).values({ date: input.date }).onConflictDoNothing()
    await tx.select({ date: serviceDays.date }).from(serviceDays).where(eq(serviceDays.date, input.date)).for('update')
    const [[found], dishes, settings] = await Promise.all([loadDays(tx, [input.date]), loadDishes(tx), loadSettings(tx)])
    // The row exists now (inserted above); the fallback only satisfies the type.
    const day: rules.DayRow = found ?? { date: input.date, cutoff: null, lockedCutoff: null, closed: false, menu: [] }
    const r = rules.saveDay({ clock: deps.clock, defaultCutoff: rules.defaultCutoffOf(settings.defaultCutoff), day, dishes }, input)
    if (!r.ok) {
      // Nothing is written; the row created above for a new day is taken back with the transaction.
      if ('closesToday' in r) throw new Refused({ ok: false, closesToday: true })
      throw new Refused({ ok: false, fields: r.fields, ...(r.fields.cutoff === 'pastCutoff' ? { saved: day } : {}) })
    }
    await tx.update(serviceDays).set({ cutoff: r.cutoff }).where(eq(serviceDays.date, input.date))
    await tx.delete(dayMenu).where(eq(dayMenu.date, input.date))
    if (r.menu.length) await tx.insert(dayMenu).values(r.menu.map((m) => ({ date: input.date, dishId: m.dishId, kind: m.kind })))
    return { ok: true as const, day: { ...day, cutoff: r.cutoff, menu: r.menu } }
  }).catch((e: unknown) => {
    if (e instanceof Refused) return e.answer
    throw e
  })
}

/** A refused Save: thrown so the transaction rolls back the row it may have created, then answered. */
class Refused extends Error {
  constructor(readonly answer: DayAnswer) {
    super('refused')
  }
}

/** The Settings page's data (S-S4): the values saved, and the default in use (09:30 while none, AC224). */
export async function settingsPage(deps: DaysDeps): Promise<SavedSettings & { cutoffInUse: number }> {
  const saved = await loadSettings(deps.db)
  return { ...saved, cutoffInUse: rules.defaultCutoffOf(saved.defaultCutoff) }
}

export type SettingsAnswer =
  { ok: true; values: rules.SettingsValues } | { ok: false; closesToday: true } | { ok: false; fields: rules.SettingsErrors }

/**
 * Saves the Settings screen (S-S4, B73): the settings row is created if needed and locked as
 * `saveRules` does, the rules run on the latest data, today's cutoff is kept when the default
 * changes while today is past it (CN-61), then the cutoff and the bank are written. The last Save
 * wins (AC229).
 */
export async function saveSettings(deps: DaysDeps, input: rules.SettingsInput): Promise<SettingsAnswer> {
  return inTransaction(deps.db, async (tx) => {
    await tx.insert(shopSettings).values({ id: true }).onConflictDoNothing()
    await tx.select({ id: shopSettings.id }).from(shopSettings).for('update')
    const [settings, [today], dishes] = await Promise.all([loadSettings(tx), loadDays(tx, [deps.clock.today]), loadDishes(tx)])
    const r = rules.saveSettings(
      { clock: deps.clock, defaultCutoff: rules.defaultCutoffOf(settings.defaultCutoff), today, dishes, banks: BANK_BINS },
      input,
    )
    if (!r.ok) return r
    if (r.lockToday !== null) {
      await tx.insert(serviceDays).values({ date: deps.clock.today }).onConflictDoNothing()
      await tx.update(serviceDays).set({ lockedCutoff: r.lockToday }).where(eq(serviceDays.date, deps.clock.today))
    }
    await tx.update(shopSettings).set({
      defaultCutoff: r.values.defaultCutoff,
      bankBin: r.values.bankBin,
      bankAccount: r.values.account,
      bankHolder: r.values.holder,
    })
    return { ok: true as const, values: r.values }
  })
}
