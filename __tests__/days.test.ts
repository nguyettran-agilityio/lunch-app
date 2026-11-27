// @vitest-environment node
// The shop's Days and Settings screens (S-S3, S-S4, PR M2-2, B73): the pure rules of
// `domain/days.ts` and `domain/banks.ts`, and `server/days.ts` with load.ts on PGlite. Test names
// give AC ids and scenario ids only (X7): AC222, AC234 and AC238 stay in the exception list until
// M2-4 shows their customer part, so their tests are named by scenario id (J1, J13, J17).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { BANKS, bankLabel, searchBanks } from '@/domain/banks'
import {
  DEFAULT_CUTOFF,
  dayCutoff,
  dayDishes,
  dayNotes,
  dishCount,
  hasCustomerMenu,
  parseCutoff,
  pastCutoff,
  readAccount,
  readHolder,
  saveDay as saveDayRule,
  saveSettings as saveSettingsRule,
  shopWeek,
  visibleMenu,
  type DayInput,
  type DayRow,
  type MenuRow,
  type SettingsInput,
} from '@/domain/days'
import { vietnamNow } from '@/domain/time'
import type { Clock, Dish } from '@/domain/types'
import { dayMenu, dishGroups, dishes, serviceDays, shopSettings } from '@/server/db/schema'
import { createTestDb, type TestDb } from './helpers/db'

vi.mock('server-only', () => ({}))
const server = await import('@/server/days')

const TODAY = '2026-11-27'
const at = (hh: number, mm: number, today = TODAY): Clock => ({ today, minutes: hh * 60 + mm })

let n = 0
const id = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`

function dish(name: string, over: Partial<Dish> = {}): Dish {
  return {
    id: id(),
    name,
    description: '',
    price: null,
    groupId: null,
    surcharge: 0,
    photoPath: null,
    drawing: null,
    active: true,
    ...over,
  }
}

const GROUP = '00000000-0000-4000-8000-00000000ff01'
const day = (date: string, over: Partial<DayRow> = {}): DayRow => ({
  date,
  cutoff: null,
  lockedCutoff: null,
  closed: false,
  menu: [],
  ...over,
})
const input = (over: Partial<DayInput> = {}): DayInput => ({
  date: TODAY,
  fixed: [],
  components: [],
  cutoff: '',
  confirmed: false,
  ...over,
})

describe('typing a cutoff', () => {
  it('AC231 J10 "9:30", "09:30" and "0930" are 09:30; "25:00", "abc", "9h30", "9.30" and "930" are not a valid time', () => {
    for (const ok of ['9:30', '09:30', '0930', ' 9:30 ', '9:30​']) expect(parseCutoff(ok)).toEqual({ value: 570 })
    expect(parseCutoff('00:00')).toEqual({ value: 0 })
    expect(parseCutoff('23:59')).toEqual({ value: 23 * 60 + 59 })
    for (const bad of ['25:00', 'abc', '9h30', '9.30', '930', '24:00', '12:60', '9:3', '09:300'])
      expect(parseCutoff(bad)).toEqual({ error: 'badTime' })
    expect(parseCutoff('  ')).toEqual({ error: 'required' })
  })
})

describe('the 7 days in Vietnam time', () => {
  it('AC223 J2 on Friday 27/11 the Days screen has Friday 27/11 to Thursday 3/12', () => {
    expect(shopWeek('2026-11-27')).toEqual([
      '2026-11-27',
      '2026-11-28',
      '2026-11-29',
      '2026-11-30',
      '2026-12-01',
      '2026-12-02',
      '2026-12-03',
    ])
  })

  it('AC223 J2 with the server clock in UTC: 23:30 UTC on 26/11 is 06:30 on 27/11 in Vietnam, 17:30 UTC is 00:30 the next day', () => {
    expect(vietnamNow(new Date('2026-11-26T23:30:00Z'))).toEqual({ today: '2026-11-27', minutes: 6 * 60 + 30 })
    expect(vietnamNow(new Date('2026-11-27T17:30:00Z'))).toEqual({ today: '2026-11-28', minutes: 30 })
    expect(shopWeek(vietnamNow(new Date('2026-11-26T23:30:00Z')).today)[0]).toBe('2026-11-27')
  })

  it('AC224 J3 the default is 09:30 until the shop saves another; a day takes its own, else the default kept, else the default', () => {
    expect(DEFAULT_CUTOFF).toBe(570)
    expect(dayCutoff(undefined, 570)).toBe(570)
    expect(dayCutoff(day(TODAY, { lockedCutoff: 540 }), 660)).toBe(540)
    expect(dayCutoff(day(TODAY, { cutoff: 630, lockedCutoff: 540 }), 660)).toBe(630)
  })

  it('AC228 a cutoff equal to the current minute is reached; a later day is never past, an earlier one always', () => {
    expect(pastCutoff(at(10, 0), TODAY, 600)).toBe(true)
    expect(pastCutoff(at(9, 59), TODAY, 600)).toBe(false)
    expect(pastCutoff(at(23, 59), '2026-11-28', 0)).toBe(false)
    expect(pastCutoff(at(0, 0), '2026-11-26', 1439)).toBe(true)
  })
})

describe('the bank fields', () => {
  it('AC225 J4 the account number drops its spaces and has 6 to 19 digits; the holder is in capital letters without accents', () => {
    expect(readAccount('0071 000 123456')).toEqual({ value: '0071000123456' })
    for (const bad of ['12345', '00710001234567890123', '0071abc']) expect(readAccount(bad)).toEqual({ error: 'accountDigits' })
    expect(readAccount(' ')).toEqual({ error: 'required' })
    expect(readHolder('Quán Cơm Lá')).toEqual({ value: 'QUAN COM LA' })
    expect(readHolder('  Quán Cơm Lá & Co ')).toEqual({ value: 'QUAN COM LA & CO' })
    expect(readHolder('Đặng Thị Ánh')).toEqual({ value: 'DANG THI ANH' })
    expect(readHolder('a'.repeat(50))).toEqual({ value: 'A'.repeat(50) })
    expect(readHolder('a'.repeat(51))).toEqual({ error: 'holderTooLong' })
    // Counted in characters after NFC: 50 letters typed in decomposed form still fit.
    expect(readHolder('á'.normalize('NFD').repeat(50))).toEqual({ value: 'A'.repeat(50) })
    expect(readHolder('')).toEqual({ error: 'required' })
  })

  it('AC230 J9 every VietQR bank A–Z by short name, with its full name; "kien" leaves KienLongBank', () => {
    const shorts = BANKS.map((b) => b.short)
    expect(shorts).toEqual([...shorts].sort((a, b) => new Intl.Collator('vi', { sensitivity: 'base' }).compare(a, b)))
    expect(new Set(BANKS.map((b) => b.bin)).size).toBe(BANKS.length)
    expect(BANKS.every((b) => /^\d{6}$/.test(b.bin))).toBe(true)
    expect(BANKS.length).toBeGreaterThan(60)
    const vcb = BANKS.find((b) => b.short === 'Vietcombank')
    expect(vcb && bankLabel(vcb)).toBe('Vietcombank – Ngân hàng TMCP Ngoại Thương Việt Nam')
    expect(searchBanks('kien').map((b) => b.short)).toEqual(['KienLongBank'])
    expect(searchBanks('KIÊN LONG').map((b) => b.short)).toEqual(['KienLongBank'])
    expect(searchBanks('ngoai thuong').map((b) => b.short)).toContain('Vietcombank')
    expect(searchBanks('')).toHaveLength(BANKS.length)
    expect(searchBanks('zzz')).toEqual([])
  })
})

describe('the dishes of a day', () => {
  it('AC226 AC237 J5 J16 the dishes being sold and those already on the menu, in one list A–Z', () => {
    const apcha = dish('Ấp chả', { price: 30000 })
    const bunbo = dish('Bún bò Huế', { price: 45000, active: false })
    const cakho = dish('Cá kho tộ', { price: 40000 })
    const canh = dish('Canh bí đỏ', { groupId: GROUP, active: false })
    const menu: MenuRow[] = [{ dishId: bunbo.id, kind: 'fixed' }]
    expect(dayDishes([cakho, canh, bunbo, apcha], menu).map((d) => d.name)).toEqual(['Ấp chả', 'Bún bò Huế', 'Cá kho tộ'])
    expect(dayDishes([cakho, canh, bunbo, apcha], []).map((d) => d.name)).toEqual(['Ấp chả', 'Cá kho tộ'])
  })

  it('J1 J13 a dish changed on the Dishes screen keeps its row, with its note, and customers see it only in the kinds still true', () => {
    const suon = dish('Cơm sườn ram', { price: null, groupId: GROUP })
    const trung = dish('Trứng chiên', { price: 30000, groupId: null })
    const bunbo = dish('Bún bò Huế', { price: 45000, active: false })
    const menu: MenuRow[] = [
      { dishId: suon.id, kind: 'fixed' },
      { dishId: suon.id, kind: 'component' },
      { dishId: trung.id, kind: 'component' },
      { dishId: bunbo.id, kind: 'fixed' },
    ]
    expect(dayNotes(suon, menu)).toEqual(['noFixed'])
    expect(dayNotes(trung, menu)).toEqual(['noComponent'])
    expect(dayNotes(bunbo, menu)).toEqual(['notSold'])
    expect(visibleMenu(menu, [suon, trung, bunbo])).toEqual([{ dishId: suon.id, kind: 'component' }])
    expect(dishCount(menu)).toBe(3)
    // "Sell again": Bún bò is back on its earlier menu.
    expect(visibleMenu(menu, [suon, trung, { ...bunbo, active: true }])).toContainEqual({ dishId: bunbo.id, kind: 'fixed' })
  })

  it('J18 a dish no longer sold, ticked in a new kind, shows to customers in both kinds only after "Sell again"', () => {
    const suon = dish('Cơm sườn ram', { price: 45000, groupId: GROUP, active: false })
    const menu: MenuRow[] = [
      { dishId: suon.id, kind: 'fixed' },
      { dishId: suon.id, kind: 'component' },
    ]
    const r = saveDayRule(
      { clock: at(8, 0), defaultCutoff: 570, day: undefined, dishes: [suon] },
      input({ date: '2026-11-28', fixed: [suon.id], components: [suon.id] }),
    )
    expect(r).toEqual({ ok: true, menu, cutoff: null })
    expect(visibleMenu(menu, [suon])).toEqual([])
    expect(visibleMenu(menu, [{ ...suon, active: true }])).toEqual(menu)
  })

  it('J17 a menu of only hidden dishes counts as no menu for customers; the card still counts the dish', () => {
    const bunbo = dish('Bún bò Huế', { price: 45000, active: false })
    const menu: MenuRow[] = [{ dishId: bunbo.id, kind: 'fixed' }]
    expect(hasCustomerMenu(menu, [bunbo])).toBe(false)
    expect(dishCount(menu)).toBe(1)
  })
})

describe('one Save of a day (the rule)', () => {
  const bunbo = dish('Bún bò Huế', { price: 45000 })
  const rau = dish('Rau muống xào', { groupId: GROUP })
  const ctx = (clock: Clock, d?: DayRow, defaultCutoff = 660) => ({ clock, defaultCutoff, day: d, dishes: [bunbo, rau] })

  it('AC227 J6 a menu with no dish of a group is saved, with no message; each dish once per kind; an unknown dish is left out', () => {
    const r = saveDayRule(ctx(at(8, 0)), input({ date: '2026-11-30', components: [rau.id, rau.id, id()] }))
    expect(r).toEqual({ ok: true, menu: [{ dishId: rau.id, kind: 'component' }], cutoff: null })
  })

  it('AC228 J7 a new cutoff at or before the current minute asks first; "Save anyway" saves it', () => {
    const today = day(TODAY, { menu: [{ dishId: bunbo.id, kind: 'fixed' }] })
    for (const cutoff of ['09:00', '10:00']) {
      expect(saveDayRule(ctx(at(10, 0), today), input({ fixed: [bunbo.id], cutoff }))).toEqual({ ok: false, closesToday: true })
    }
    expect(saveDayRule(ctx(at(10, 0), today), input({ fixed: [bunbo.id], cutoff: '10:01' }))).toMatchObject({ ok: true, cutoff: 601 })
    expect(saveDayRule(ctx(at(10, 0), today), input({ fixed: [bunbo.id], cutoff: '09:00', confirmed: true }))).toMatchObject({
      ok: true,
      cutoff: 540,
    })
    // Another day never asks.
    expect(saveDayRule(ctx(at(10, 0)), input({ date: '2026-11-28', fixed: [bunbo.id], cutoff: '09:00' }))).toMatchObject({ ok: true })
  })

  it('J17 no question when today keeps no dish customers see', () => {
    const hidden = { ...bunbo, active: false }
    const r = saveDayRule(
      { clock: at(10, 0), defaultCutoff: 660, day: day(TODAY), dishes: [hidden, rau] },
      input({ fixed: [hidden.id], cutoff: '09:00' }),
    )
    expect(r).toEqual({ ok: true, menu: [{ dishId: hidden.id, kind: 'fixed' }], cutoff: 540 })
  })

  it('AC232 J11 after the cutoff the menu is still saved while the cutoff is unchanged', () => {
    const today = day(TODAY, { menu: [{ dishId: bunbo.id, kind: 'fixed' }] })
    expect(saveDayRule(ctx(at(13, 0), today, 570), input({ fixed: [] }))).toEqual({ ok: true, menu: [], cutoff: null })
    const own = day(TODAY, { cutoff: 600 })
    expect(saveDayRule(ctx(at(13, 0), own, 570), input({ cutoff: '10:00' }))).toEqual({ ok: true, menu: [], cutoff: 600 })
  })

  it('AC235 J14 after the cutoff a changed cutoff refuses the whole Save', () => {
    const today = day(TODAY, { menu: [{ dishId: bunbo.id, kind: 'fixed' }] })
    expect(saveDayRule(ctx(at(9, 40), today, 570), input({ fixed: [], cutoff: '10:00' }))).toEqual({
      ok: false,
      fields: { cutoff: 'pastCutoff' },
    })
  })

  it('AC233 J12 an empty cutoff is the default', () => {
    expect(saveDayRule(ctx(at(8, 0), day('2026-12-01', { cutoff: 630 })), input({ date: '2026-12-01', cutoff: '' }))).toMatchObject({
      ok: true,
      cutoff: null,
    })
  })

  it('AC231 J10 a cutoff that is not a valid time saves nothing', () => {
    expect(saveDayRule(ctx(at(8, 0)), input({ date: '2026-11-28', cutoff: '9h30' }))).toEqual({ ok: false, fields: { cutoff: 'badTime' } })
  })

  it('AC236 J15 a day no longer among the 7 days is refused', () => {
    expect(saveDayRule(ctx(at(0, 1, '2026-11-28')), input({ date: '2026-11-27' }))).toEqual({ ok: false, fields: { form: 'dayPassed' } })
    expect(saveDayRule(ctx(at(8, 0)), input({ date: '2026-12-04' }))).toEqual({ ok: false, fields: { form: 'dayPassed' } })
  })
})

describe('one Save of the settings (the rule)', () => {
  const bunbo = dish('Bún bò Huế', { price: 45000 })
  const banks = new Set(BANKS.map((b) => b.bin))
  const VCB = '970436'
  const form = (over: Partial<SettingsInput> = {}): SettingsInput => ({
    defaultCutoff: '09:30',
    bankBin: VCB,
    account: '0071 000 123456',
    holder: 'Quán Cơm Lá',
    confirmed: false,
    ...over,
  })
  const ctx = (clock: Clock, today?: DayRow, defaultCutoff = 570) => ({ clock, defaultCutoff, today, dishes: [bunbo], banks })

  it('AC225 J4 every field is required; nothing is saved while one is refused', () => {
    expect(saveSettingsRule(ctx(at(8, 0)), form({ account: '', bankBin: '', holder: 'a'.repeat(51), defaultCutoff: 'abc' }))).toEqual({
      ok: false,
      fields: { defaultCutoff: 'badTime', bankBin: 'required', account: 'required', holder: 'holderTooLong' },
    })
    expect(saveSettingsRule(ctx(at(8, 0)), form())).toEqual({
      ok: true,
      values: { defaultCutoff: 570, bankBin: VCB, account: '0071000123456', holder: 'QUAN COM LA' },
      lockToday: null,
    })
  })

  it('AC228 J7 a new default at or before now asks first when today uses it and has a menu', () => {
    const today = day(TODAY, { menu: [{ dishId: bunbo.id, kind: 'fixed' }] })
    expect(saveSettingsRule(ctx(at(10, 0), today, 660), form({ defaultCutoff: '09:00' }))).toEqual({ ok: false, closesToday: true })
    expect(saveSettingsRule(ctx(at(10, 0), today, 660), form({ defaultCutoff: '09:00', confirmed: true }))).toMatchObject({
      ok: true,
      lockToday: null,
    })
    // Today with its own cutoff, or with no menu, does not ask.
    expect(saveSettingsRule(ctx(at(10, 0), { ...today, cutoff: 700 }, 660), form({ defaultCutoff: '09:00' }))).toMatchObject({ ok: true })
    expect(saveSettingsRule(ctx(at(10, 0), day(TODAY), 660), form({ defaultCutoff: '09:00' }))).toMatchObject({ ok: true })
  })

  it('a new default while today uses the default and is past it keeps today on the old default', () => {
    expect(saveSettingsRule(ctx(at(10, 0), undefined, 570), form({ defaultCutoff: '11:00' }))).toMatchObject({ ok: true, lockToday: 570 })
    // The same default saved again changes nothing.
    expect(saveSettingsRule(ctx(at(10, 0), undefined, 570), form({ defaultCutoff: '9:30' }))).toMatchObject({ ok: true, lockToday: null })
  })
})

describe('the Days and Settings screens on the database', () => {
  let t: TestDb
  const deps = (clock: Clock) => ({ db: t.db, clock })
  let bunbo: string
  let rau: string

  beforeEach(async () => {
    t = await createTestDb()
    const [g] = await t.db
      .insert(dishGroups)
      .values({ name: 'Rau', nameKey: 'rau', min: 1, max: 1, included: 1, extraFee: 0, position: 0 })
      .returning()
    const rows = await t.db
      .insert(dishes)
      .values([
        { name: 'Bún bò Huế', nameKey: 'bún bò huế', price: 45000 },
        { name: 'Rau muống xào', nameKey: 'rau muống xào', groupId: g.id },
      ])
      .returning()
    bunbo = rows[0].id
    rau = rows[1].id
  })

  afterEach(async () => {
    await t.close()
  })

  it('AC224 J3 with no settings saved, the default cutoff is 09:30 on both screens', async () => {
    expect((await server.settingsPage(deps(at(8, 0)))).cutoffInUse).toBe(570)
    const page = await server.daysPage(deps(at(8, 0)))
    expect(page.defaultCutoff).toBe(570)
    expect(page.week).toHaveLength(7)
    expect(page.week[0]).toBe(TODAY)
  })

  it('AC226 J5 a Save writes the day and its menu; unticking every dish takes the day back to no menu', async () => {
    const r = await server.saveDay(deps(at(8, 0)), input({ date: '2026-11-30', fixed: [bunbo], components: [rau] }))
    expect(r).toMatchObject({ ok: true })
    const menu = await t.db.select().from(dayMenu).where(eq(dayMenu.date, '2026-11-30'))
    expect(menu.map((m) => m.kind).sort()).toEqual(['component', 'fixed'])
    await server.saveDay(deps(at(8, 0)), input({ date: '2026-11-30' }))
    expect(await t.db.select().from(dayMenu).where(eq(dayMenu.date, '2026-11-30'))).toEqual([])
    const page = await server.daysPage(deps(at(8, 0)))
    expect(page.days.find((d) => d.date === '2026-11-30')?.menu).toEqual([])
  })

  it('AC229 J8 the last Save of a day wins', async () => {
    await server.saveDay(deps(at(8, 0)), input({ date: '2026-12-01', fixed: [bunbo] }))
    await server.saveDay(deps(at(8, 0)), input({ date: '2026-12-01', components: [rau] }))
    expect(await t.db.select({ dishId: dayMenu.dishId }).from(dayMenu).where(eq(dayMenu.date, '2026-12-01'))).toEqual([{ dishId: rau }])
  })

  it('AC228 AC231 AC236 J7 J10 J15 a refused Save writes nothing, not even a new day row', async () => {
    await server.saveSettings(deps(at(6, 0)), {
      defaultCutoff: '11:00',
      bankBin: '970436',
      account: '0071000123456',
      holder: 'x',
      confirmed: false,
    })
    expect(await server.saveDay(deps(at(10, 0)), input({ fixed: [bunbo], cutoff: '09:00' }))).toEqual({ ok: false, closesToday: true })
    expect(await server.saveDay(deps(at(8, 0)), input({ date: '2026-11-28', cutoff: '25:00' }))).toEqual({
      ok: false,
      fields: { cutoff: 'badTime' },
    })
    expect(await server.saveDay(deps(at(0, 1, '2026-11-28')), input({ date: '2026-11-27', fixed: [bunbo] }))).toEqual({
      ok: false,
      fields: { form: 'dayPassed' },
    })
    expect(await t.db.select().from(serviceDays)).toEqual([])
    expect(await server.saveDay(deps(at(10, 0)), input({ fixed: [bunbo], cutoff: '09:00', confirmed: true }))).toMatchObject({ ok: true })
    const [row] = await t.db.select().from(serviceDays)
    expect(row).toMatchObject({ date: TODAY, cutoff: 540 })
  })

  it('AC232 AC235 J11 J14 after the cutoff: the menu alone is saved; a changed cutoff saves nothing and sends the day back', async () => {
    await server.saveDay(deps(at(8, 0)), input({ fixed: [bunbo] }))
    const late = await server.saveDay(deps(at(9, 40)), input({ fixed: [], cutoff: '10:00' }))
    expect(late).toMatchObject({ ok: false, fields: { cutoff: 'pastCutoff' }, saved: { date: TODAY, cutoff: null } })
    expect(await t.db.select({ dishId: dayMenu.dishId }).from(dayMenu)).toEqual([{ dishId: bunbo }])
    expect(await server.saveDay(deps(at(9, 40)), input({ fixed: [] }))).toMatchObject({ ok: true })
    expect(await t.db.select().from(dayMenu)).toEqual([])
  })

  it('AC233 J12 an emptied day cutoff follows the default, also when the default changes later', async () => {
    await server.saveDay(deps(at(8, 0)), input({ date: '2026-12-01', cutoff: '10:30' }))
    await server.saveDay(deps(at(8, 0)), input({ date: '2026-12-01', cutoff: '' }))
    const settings = { bankBin: '970436', account: '0071000123456', holder: 'x', confirmed: false }
    await server.saveSettings(deps(at(8, 0)), { ...settings, defaultCutoff: '10:00' })
    const page = await server.daysPage(deps(at(8, 0)))
    const d = page.days.find((x) => x.date === '2026-12-01')
    expect(d?.cutoff).toBeNull()
    expect(dayCutoff(d, page.defaultCutoff)).toBe(600)
  })

  it('AC225 AC229 J4 J8 the settings are saved cleaned, and the last Save wins', async () => {
    const base = { defaultCutoff: '9:30', account: '0071 000 123456', holder: 'Quán Cơm Lá & Co', confirmed: false }
    expect(await server.saveSettings(deps(at(8, 0)), { ...base, bankBin: '970436' })).toEqual({
      ok: true,
      values: { defaultCutoff: 570, bankBin: '970436', account: '0071000123456', holder: 'QUAN COM LA & CO' },
    })
    await server.saveSettings(deps(at(8, 0)), { ...base, bankBin: '970407' })
    const [row] = await t.db.select().from(shopSettings)
    expect(row).toMatchObject({ defaultCutoff: 570, bankBin: '970407', bankAccount: '0071000123456', bankHolder: 'QUAN COM LA & CO' })
    expect(await server.saveSettings(deps(at(8, 0)), { ...base, bankBin: '000000' })).toEqual({
      ok: false,
      fields: { bankBin: 'required' },
    })
  })

  it('a new default while today is past the old one keeps today closed, and changes the later days', async () => {
    const settings = { bankBin: '970436', account: '0071000123456', holder: 'x', confirmed: false }
    await server.saveSettings(deps(at(10, 0)), { ...settings, defaultCutoff: '11:00' })
    const page = await server.daysPage(deps(at(10, 0)))
    const today = page.days.find((d) => d.date === TODAY)
    expect(today?.lockedCutoff).toBe(570)
    expect(pastCutoff(at(10, 0), TODAY, dayCutoff(today, page.defaultCutoff))).toBe(true)
    expect(
      dayCutoff(
        page.days.find((d) => d.date === '2026-11-28'),
        page.defaultCutoff,
      ),
    ).toBe(660)
    // A later change keeps the cutoff first kept.
    await server.saveSettings(deps(at(12, 0)), { ...settings, defaultCutoff: '12:30' })
    const [row] = await t.db.select().from(serviceDays).where(eq(serviceDays.date, TODAY))
    expect(row.lockedCutoff).toBe(570)
  })
})
