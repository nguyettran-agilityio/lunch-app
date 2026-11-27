// The shop's Days and Settings screens, S-S3 and S-S4 (PR M2-2, B73, B74), on the e2e server in the
// test sign-in mode, in Vietnamese, with the server running in UTC (playwright.config.ts). The days,
// the settings and the dishes are shared by the whole shop: this file runs after dishes.spec.ts, in
// its own project, its tests one after the other, each going on from the state the one before left.
// It makes its own group and dishes, named "Ngày …". The clock of each browser context is set to a
// time of today in Vietnam with the test clock cookie (B59). Test names give AC ids and scenario ids
// only (X7); AC222, AC234 and AC238 wait for M2-4, so their scenarios are named J1, J13, J17.
import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { messages } from '@/domain/i18n'
import { addDays, weekday } from '@/domain/time'
import { setClock } from './helpers'

test.describe.configure({ mode: 'serial' })

const s = messages.vi.shopSetup
const HOUR = 3600 * 1000

/** Today's date in Vietnam (UTC+7, no summer time) at the real time now. */
function vietnamToday(): string {
  return new Date(Date.now() + 7 * HOUR).toISOString().slice(0, 10)
}

/**
 * Sets this context's clock to hh:mm:ss of today in Vietnam (`shift` days later), and returns that
 * day with the UTC date at that moment.
 */
async function vietnamClock(
  context: BrowserContext,
  hh: number,
  mm: number,
  ss = 0,
  shift = 0,
): Promise<{ today: string; utcDate: string }> {
  const today = addDays(vietnamToday(), shift)
  const target = Date.parse(`${today}T00:00:00Z`) - 7 * HOUR + ((hh * 60 + mm) * 60 + ss) * 1000
  await setClock(context, Math.round((target - Date.now()) / 1000))
  return { today, utcDate: new Date(target).toISOString().slice(0, 10) }
}

async function asShop(page: Page) {
  expect((await page.request.get('/test/sign-in?account=shop')).status()).toBe(200)
}

/** Taps a button that runs a Server Action and waits for its answer. */
async function tap(page: Page, name: string) {
  await Promise.all([page.waitForResponse((r) => r.request().method() === 'POST'), page.getByRole('button', { name, exact: true }).click()])
  await page.waitForLoadState('networkidle')
}

const card = (page: Page, date: string) => page.locator(`[data-day-card="${date}"]`)
const dishRow = (page: Page, name: string) => page.locator(`[data-day-dish="${name}"]`)
const fixedTick = (page: Page, name: string) => dishRow(page, name).getByLabel(s.fixed)
const componentTick = (page: Page, name: string) => dishRow(page, name).getByLabel(s.component)
/** "Thứ sáu 27/11": the day and month without a leading zero (AC223). */
const label = (date: string) =>
  s.dayLabel(messages.vi.weekdaysLong[weekday(date)], `${Number(date.slice(8, 10))}/${Number(date.slice(5, 7))}`)

async function openDay(page: Page, date: string) {
  await page.goto('/shop/days')
  await card(page, date)
    .getByRole('button', { name: s.openDay(label(date)) })
    .click()
  await expect(page.locator('#day-cutoff')).toBeVisible()
}

async function dishNames(page: Page): Promise<string[]> {
  const all = await page.locator('[data-day-dish]').evaluateAll((els) => els.map((e) => e.getAttribute('data-day-dish') ?? ''))
  return all.filter((n) => n.startsWith('Ngày '))
}

/** Adds a dish on the Dishes screen: a ready meal with its price and/or a build-your-own dish of "Nhóm ngày". */
async function addDish(page: Page, name: string, price: string | null, component: boolean) {
  await page.goto('/shop/dishes')
  await page.getByRole('button', { name: 'Thêm món' }).click()
  await page.locator('#dish-name').fill(name)
  if (price) {
    await page.getByLabel('Phần ăn sẵn').check()
    await page.locator('#dish-price').fill(price)
  }
  if (component) {
    await page.getByLabel('Món của cơm tự chọn').check()
    await page.locator('#dish-group').selectOption({ label: 'Nhóm ngày' })
    await page.locator('#dish-surcharge').fill('0')
  }
  await tap(page, 'Lưu')
  await expect(page.locator(`[data-dish-card="${name}"]`)).toBeVisible()
}

async function editDish(page: Page, name: string, change: (page: Page) => Promise<void>, button = 'Lưu') {
  await page.goto('/shop/dishes')
  await page.getByRole('button', { name: `Sửa ${name}` }).click()
  await change(page)
  await tap(page, button)
}

test('setup: the group and the dishes the Days tests use', async ({ page }) => {
  await asShop(page)
  await page.goto('/shop/rules')
  await page.getByRole('button', { name: '+ Thêm nhóm' }).click()
  const row = page.locator('li[data-group-row]').last()
  await row.getByLabel('Tên nhóm', { exact: true }).fill('Nhóm ngày')
  for (const [field, v] of [
    ['Tối thiểu', '1'],
    ['Tối đa', '2'],
    ['Kèm sẵn', '1'],
    ['Phí thêm món', '0'],
  ])
    await row.getByLabel(field, { exact: true }).fill(v)
  await tap(page, 'Lưu')
  await expect(page.getByRole('status')).toContainText('Đã lưu')
  await addDish(page, 'Ngày Cơm sườn', '45.000', true)
  await addDish(page, 'Ngày Bún bò', '45.000', false)
  await addDish(page, 'Ngày Trứng', '30.000', true)
  await addDish(page, 'Ngày Ấp chả', '30.000', false)
  await addDish(page, 'Ngày Cá kho', '40.000', false)
  await addDish(page, 'Ngày Rau', null, true)
  await addDish(page, 'Ngày Sườn non', '50.000', true)
  await addDish(page, 'Ngày Canh bí', null, true)
  await editDish(page, 'Ngày Canh bí', async () => {}, 'Ngừng bán')
})

test('AC223 AC224 AC228 J2 J3 J7 at 06:30 in Vietnam, the server in UTC: the 7 days start on Vietnam’s today, and a cutoff at the current minute asks first', async ({
  page,
  context,
}) => {
  await asShop(page)
  const { today, utcDate } = await vietnamClock(context, 6, 30)
  // At 06:30 in Vietnam it is still the day before in UTC, the server's own time zone.
  expect(utcDate).toBe(addDays(today, -1))
  await page.goto('/shop/settings')
  await expect(page.locator('#settings-cutoff')).toHaveValue('09:30')
  await page.goto('/shop/days')
  const dates = await page.locator('[data-day-card]').evaluateAll((els) => els.map((e) => e.getAttribute('data-day-card')))
  expect(dates).toEqual(Array.from({ length: 7 }, (_, i) => addDays(today, i)))
  await expect(card(page, today).locator('[data-day-label]')).toHaveText(label(today))
  await expect(card(page, today)).toContainText(s.today)
  await expect(card(page, today).locator('[data-day-cutoff]')).toHaveText(s.cutoffDefault('09:30'))

  await openDay(page, today)
  await fixedTick(page, 'Ngày Bún bò').check()
  await page.locator('#day-cutoff').fill('06:30')
  await tap(page, 'Lưu')
  await expect(page.locator('main [role=alert]')).toContainText(s.closesToday)
  await page.getByRole('button', { name: s.dontSave, exact: true }).click()
  await expect(page.getByText(s.closesToday)).toHaveCount(0)
  await expect(page.locator('#day-cutoff')).toHaveValue('06:30')
  await expect(fixedTick(page, 'Ngày Bún bò')).toBeChecked()
  await page.locator('#day-cutoff').fill('')
  await tap(page, 'Lưu')
  await expect(page.getByRole('status')).toContainText('Đã lưu')
  await expect(card(page, today).locator('[data-day-menu]')).toHaveText(s.dishCount(1))
  await expect(card(page, today)).not.toContainText(s.pastCutoff)
})

test('AC225 AC229 AC230 AC231 J4 J8 J9 J10 Settings: the checks, the bank list, a save kept after reloading, and the last Save wins', async ({
  page,
  context,
  browser,
}) => {
  await asShop(page)
  await vietnamClock(context, 6, 30)
  await page.goto('/shop/settings')
  await tap(page, 'Lưu')
  await expect(page.locator('#settings-bank-error')).toHaveText(s.field.required)
  await expect(page.locator('#settings-account-error')).toHaveText(s.field.required)
  await expect(page.locator('#settings-holder-error')).toHaveText(s.field.required)

  await page.locator('#settings-bank-search').fill('kien')
  await expect(page.getByRole('radio')).toHaveCount(1)
  await expect(page.getByRole('radio', { name: 'KienLongBank – Ngân hàng TMCP Kiên Long' })).toBeVisible()
  await page.locator('#settings-bank-search').fill('ngoai thuong viet')
  await page.getByRole('radio', { name: 'Vietcombank – Ngân hàng TMCP Ngoại Thương Việt Nam' }).check()
  await expect(page.locator('#settings-bank-picked')).toContainText('Vietcombank')

  await page.locator('#settings-account').fill('12345')
  await page.locator('#settings-holder').fill('a'.repeat(51))
  await page.locator('#settings-cutoff').fill('9h30')
  await tap(page, 'Lưu')
  await expect(page.locator('#settings-account-error')).toHaveText(s.field.accountDigits)
  await expect(page.locator('#settings-holder-error')).toHaveText(s.field.holderTooLong)
  await expect(page.locator('#settings-cutoff-error')).toHaveText(s.field.badTime)
  for (const bad of ['25:00', 'abc', '9.30', '930']) {
    await page.locator('#settings-cutoff').fill(bad)
    await tap(page, 'Lưu')
    await expect(page.locator('#settings-cutoff-error')).toHaveText(s.field.badTime)
  }

  // A second device opens the screen now, before the first one saves.
  const other = await browser.newContext()
  const phone = await other.newPage()
  await asShop(phone)
  await vietnamClock(other, 6, 30)
  await phone.goto('/shop/settings')

  await page.locator('#settings-account').fill('0071 000 123456')
  await page.locator('#settings-holder').fill('Quán Cơm Lá & Co')
  await page.locator('#settings-cutoff').fill('0930')
  await tap(page, 'Lưu')
  await expect(page.getByRole('status')).toContainText('Đã lưu')
  await expect(page.locator('#settings-cutoff')).toHaveValue('09:30')
  await expect(page.locator('#settings-account')).toHaveValue('0071000123456')
  await expect(page.locator('#settings-holder')).toHaveValue('QUAN COM LA & CO')
  await page.reload()
  await expect(page.locator('#settings-bank-picked')).toContainText('Vietcombank – Ngân hàng TMCP Ngoại Thương Việt Nam')
  await expect(page.locator('#settings-account')).toHaveValue('0071000123456')
  await expect(page.locator('#settings-holder')).toHaveValue('QUAN COM LA & CO')

  await phone.locator('#settings-bank-search').fill('techcom')
  await phone.getByRole('radio', { name: /^Techcombank/ }).check()
  await phone.locator('#settings-account').fill('19030000000000')
  await phone.locator('#settings-holder').fill('Quán Cơm Lá')
  await phone.locator('#settings-cutoff').fill('11:00')
  await tap(phone, 'Lưu')
  await expect(phone.getByRole('status')).toContainText('Đã lưu')
  await other.close()
  await page.reload()
  await expect(page.locator('#settings-bank-picked')).toContainText('Techcombank')
  await expect(page.locator('#settings-holder')).toHaveValue('QUAN COM LA')
  await expect(page.locator('#settings-cutoff')).toHaveValue('11:00')
})

test('AC226 AC233 J5 J12 a day: only the ticks each dish allows, its own cutoff and back to the default, then no menu', async ({
  page,
  context,
}) => {
  await asShop(page)
  const { today } = await vietnamClock(context, 6, 30)
  const date = addDays(today, 1)
  await openDay(page, date)
  expect(await dishNames(page)).toEqual([
    'Ngày Ấp chả',
    'Ngày Bún bò',
    'Ngày Cá kho',
    'Ngày Cơm sườn',
    'Ngày Rau',
    'Ngày Sườn non',
    'Ngày Trứng',
  ])
  await expect(componentTick(page, 'Ngày Bún bò')).toHaveCount(0)
  await expect(fixedTick(page, 'Ngày Rau')).toHaveCount(0)
  await expect(componentTick(page, 'Ngày Rau')).toBeVisible()
  await expect(fixedTick(page, 'Ngày Cơm sườn')).toBeVisible()
  await expect(componentTick(page, 'Ngày Cơm sườn')).toBeVisible()
  await expect(page.locator('#day-cutoff-hint')).toHaveText(s.defaultHint('11:00'))
  await fixedTick(page, 'Ngày Cơm sườn').check()
  await componentTick(page, 'Ngày Cơm sườn').check()
  await fixedTick(page, 'Ngày Bún bò').check()
  await page.locator('#day-cutoff').fill('1030')
  await tap(page, 'Lưu')
  await expect(page.getByRole('status')).toContainText('Đã lưu')
  await expect(page.locator('#day-cutoff')).toHaveValue('10:30')
  await expect(card(page, date).locator('[data-day-menu]')).toHaveText(s.dishCount(2))
  await expect(card(page, date).locator('[data-day-cutoff]')).toHaveText(s.cutoffOwn('10:30'))

  await page.locator('#day-cutoff').fill('')
  await tap(page, 'Lưu')
  await expect(card(page, date).locator('[data-day-cutoff]')).toHaveText(s.cutoffDefault('11:00'))
  await page.reload()
  await openDay(page, date)
  await expect(page.locator('#day-cutoff')).toHaveValue('')
  await expect(fixedTick(page, 'Ngày Bún bò')).toBeChecked()

  for (const tick of [fixedTick(page, 'Ngày Cơm sườn'), componentTick(page, 'Ngày Cơm sườn'), fixedTick(page, 'Ngày Bún bò')])
    await tick.uncheck()
  await tap(page, 'Lưu')
  await expect(card(page, date).locator('[data-day-menu]')).toHaveText(s.noMenuYet)
})

test('AC237 J1 J13 J16 J17 dishes changed on the Dishes screen stay on the menu with their notes, in one A–Z list', async ({
  page,
  context,
}) => {
  await asShop(page)
  const { today } = await vietnamClock(context, 6, 30)
  const date = addDays(today, 2)
  await openDay(page, date)
  await fixedTick(page, 'Ngày Cơm sườn').check()
  await componentTick(page, 'Ngày Trứng').check()
  await fixedTick(page, 'Ngày Bún bò').check()
  await tap(page, 'Lưu')
  await expect(card(page, date).locator('[data-day-menu]')).toHaveText(s.dishCount(3))

  await editDish(page, 'Ngày Cơm sườn', (p) => p.getByLabel('Phần ăn sẵn').uncheck())
  await editDish(page, 'Ngày Trứng', (p) => p.getByLabel('Món của cơm tự chọn').uncheck())
  await editDish(page, 'Ngày Bún bò', async () => {}, 'Ngừng bán')

  await openDay(page, date)
  expect(await dishNames(page)).toEqual([
    'Ngày Ấp chả',
    'Ngày Bún bò',
    'Ngày Cá kho',
    'Ngày Cơm sườn',
    'Ngày Rau',
    'Ngày Sườn non',
    'Ngày Trứng',
  ])
  await expect(dishRow(page, 'Ngày Bún bò')).toContainText(s.noteNotSold)
  await expect(dishRow(page, 'Ngày Cơm sườn')).toContainText(s.noteNoFixed)
  await expect(dishRow(page, 'Ngày Trứng')).toContainText(s.noteNoComponent)
  await expect(fixedTick(page, 'Ngày Cơm sườn')).toBeChecked()
  await expect(componentTick(page, 'Ngày Trứng')).toBeChecked()
  // The card still counts the dishes hidden from customers.
  await expect(card(page, date).locator('[data-day-menu]')).toHaveText(s.dishCount(3))

  await page.goto('/shop/dishes')
  await tap(page, 'Bán lại Ngày Bún bò')
  await openDay(page, date)
  await expect(dishRow(page, 'Ngày Bún bò')).not.toContainText(s.noteNotSold)
  await expect(fixedTick(page, 'Ngày Bún bò')).toBeChecked()
})

test('J18 a dish no longer sold keeps every tick its kinds allow: a new kind can be ticked and saved', async ({ page, context }) => {
  await asShop(page)
  const { today } = await vietnamClock(context, 6, 30)
  const date = addDays(today, 4)
  await openDay(page, date)
  await fixedTick(page, 'Ngày Sườn non').check()
  await tap(page, 'Lưu')
  await editDish(page, 'Ngày Sườn non', async () => {}, 'Ngừng bán')
  await openDay(page, date)
  await expect(dishRow(page, 'Ngày Sườn non')).toContainText(s.noteNotSold)
  await expect(fixedTick(page, 'Ngày Sườn non')).toBeChecked()
  await componentTick(page, 'Ngày Sườn non').check()
  await tap(page, 'Lưu')
  await expect(page.getByRole('status')).toContainText('Đã lưu')
  await page.goto('/shop/dishes')
  await tap(page, 'Bán lại Ngày Sườn non')
  await openDay(page, date)
  await expect(dishRow(page, 'Ngày Sườn non')).not.toContainText(s.noteNotSold)
  await expect(fixedTick(page, 'Ngày Sườn non')).toBeChecked()
  await expect(componentTick(page, 'Ngày Sườn non')).toBeChecked()
})

test('AC229 J8 a day open on two devices: the last Save wins', async ({ page, context, browser }) => {
  await asShop(page)
  const { today } = await vietnamClock(context, 6, 30)
  const date = addDays(today, 3)
  const other = await browser.newContext()
  const computer = await other.newPage()
  await asShop(computer)
  await vietnamClock(other, 6, 30)
  await openDay(computer, date)
  await openDay(page, date)
  await fixedTick(page, 'Ngày Cá kho').check()
  await tap(page, 'Lưu')
  await fixedTick(computer, 'Ngày Ấp chả').check()
  await tap(computer, 'Lưu')
  await other.close()
  await openDay(page, date)
  await expect(fixedTick(page, 'Ngày Cá kho')).not.toBeChecked()
  await expect(fixedTick(page, 'Ngày Ấp chả')).toBeChecked()
})

test('AC235 J14 a form opened before the cutoff and saved after it with a changed cutoff saves nothing; the next Save saves the menu', async ({
  page,
  context,
}) => {
  await asShop(page)
  const { today } = await vietnamClock(context, 10, 50)
  await openDay(page, today)
  await fixedTick(page, 'Ngày Bún bò').uncheck()
  await page.locator('#day-cutoff').fill('12:00')
  await vietnamClock(context, 11, 10)
  await tap(page, 'Lưu')
  await expect(page.locator('#day-cutoff')).toBeDisabled()
  await expect(page.locator('#day-cutoff')).toHaveValue('')
  await expect(page.locator('#day-cutoff-hint')).toHaveText(s.defaultHint('11:00'))
  await expect(page.locator('#day-cutoff-locked')).toHaveText(s.cutoffLocked)
  await expect(fixedTick(page, 'Ngày Bún bò')).not.toBeChecked()
  // The page is loaded again with the server's time: the card shows that today is past its cutoff.
  await expect(card(page, today)).toContainText(s.pastCutoff)
  await page.reload()
  await expect(card(page, today).locator('[data-day-menu]')).toHaveText(s.dishCount(1))
  await openDay(page, today)
  await fixedTick(page, 'Ngày Bún bò').uncheck()
  await tap(page, 'Lưu')
  await expect(page.getByRole('status')).toContainText('Đã lưu')
  await expect(card(page, today).locator('[data-day-menu]')).toHaveText(s.noMenuYet)
  await expect(card(page, today)).toContainText(s.pastCutoff)
})

test('AC228 J7 at 10:00:20, open until 11:00: a cutoff of 09:00 or 10:00 asks first on both screens; "Cancel" keeps what was typed; "Save anyway" closes today', async ({
  page,
  context,
}) => {
  await asShop(page)
  const { today } = await vietnamClock(context, 10, 0, 20)
  await openDay(page, today)
  await fixedTick(page, 'Ngày Ấp chả').check()
  await fixedTick(page, 'Ngày Cá kho').check()
  for (const cutoff of ['09:00', '10:00']) {
    await page.locator('#day-cutoff').fill(cutoff)
    await tap(page, 'Lưu')
    await expect(page.locator('main [role=alert]')).toContainText(s.closesToday)
    await page.getByRole('button', { name: s.dontSave, exact: true }).click()
    await expect(page.locator('#day-cutoff')).toHaveValue(cutoff)
    await expect(fixedTick(page, 'Ngày Ấp chả')).toBeChecked()
    await expect(fixedTick(page, 'Ngày Cá kho')).toBeChecked()
  }
  await page.reload()
  await expect(card(page, today).locator('[data-day-menu]')).toHaveText(s.noMenuYet)

  // Settings: today now has a menu only once saved; the menu is saved first with the default.
  await openDay(page, today)
  await fixedTick(page, 'Ngày Ấp chả').check()
  await fixedTick(page, 'Ngày Cá kho').check()
  await tap(page, 'Lưu')
  await expect(page.getByRole('status')).toContainText('Đã lưu')
  await page.goto('/shop/settings')
  await page.locator('#settings-cutoff').fill('09:00')
  await tap(page, 'Lưu')
  await expect(page.locator('main [role=alert]')).toContainText(s.closesToday)
  await page.getByRole('button', { name: s.dontSave, exact: true }).click()
  await expect(page.locator('#settings-cutoff')).toHaveValue('09:00')
  await page.reload()
  await expect(page.locator('#settings-cutoff')).toHaveValue('11:00')

  await openDay(page, today)
  await page.locator('#day-cutoff').fill('10:00')
  await tap(page, 'Lưu')
  await expect(page.locator('main [role=alert]')).toContainText(s.closesToday)
  await tap(page, s.saveAnyway)
  await expect(card(page, today)).toContainText(s.pastCutoff)
  await expect(card(page, today).locator('[data-day-cutoff]')).toHaveText(s.cutoffOwn('10:00'))
  await expect(page.locator('#day-cutoff')).toBeDisabled()
})

test('AC232 J11 after the cutoff today’s menu can still be changed; its cutoff is locked', async ({ page, context }) => {
  await asShop(page)
  const { today } = await vietnamClock(context, 13, 0)
  await openDay(page, today)
  await expect(page.locator('#day-cutoff')).toBeDisabled()
  await expect(page.locator('#day-cutoff-locked')).toHaveText(s.cutoffLocked)
  await fixedTick(page, 'Ngày Ấp chả').uncheck()
  await tap(page, 'Lưu')
  await expect(page.getByRole('status')).toContainText('Đã lưu')
  await expect(card(page, today).locator('[data-day-menu]')).toHaveText(s.dishCount(1))
  await expect(card(page, today).locator('[data-day-cutoff]')).toHaveText(s.cutoffOwn('10:00'))
})

test('AC236 J15 a day opened at 23:58 and saved at 00:01: "This day has passed" and the new 7 days', async ({ page, context }) => {
  await asShop(page)
  const { today } = await vietnamClock(context, 23, 58)
  await openDay(page, today)
  await fixedTick(page, 'Ngày Bún bò').check()
  await vietnamClock(context, 0, 1, 0, 1)
  await tap(page, 'Lưu')
  await expect(page.locator('main [role=alert]')).toContainText(s.field.dayPassed)
  const dates = await page.locator('[data-day-card]').evaluateAll((els) => els.map((e) => e.getAttribute('data-day-card')))
  expect(dates[0]).toBe(addDays(today, 1))
  expect(dates).toHaveLength(7)
})
