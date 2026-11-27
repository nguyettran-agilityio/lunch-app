// The shop's Dishes and Build-your-own rules screens, S-S1 and S-S2 (PR M2-1, B71), on the e2e
// server in the test sign-in mode, in Vietnamese. The groups and the base price are shared by the
// whole shop, so the tests of this file run one after the other, each going on from the state the
// one before left; no other test file writes dishes or groups. The photo bucket is the test
// version of the StorageProvider (/test/files). Test names give AC ids and scenario ids only (X7).
import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { TEST_ACCOUNTS, TEST_PASSWORD } from '@/server/auth/test-accounts'
import { signIn } from './helpers'

test.describe.configure({ mode: 'serial' })

const BASE = 'http://127.0.0.1:3100'

// Small real images, so the browser can draw and shrink them: a PNG, a WebP and a two-frame GIF.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGNgYPj/n4GBgYGBgYGBAQAs/AX7wJtWuwAAAABJRU5ErkJggg==',
  'base64',
)
const WEBP = Buffer.from('UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA', 'base64')
const GIF = Buffer.from(
  'R0lGODlhAQABAPAAAP8AAP///yH/C05FVFNDQVBFMi4wAwEAAAAh+QQEAAAAACwAAAAAAQABAAACAkQBACH5BAQAAAAALAAAAAABAAEAAAICRAEAOw==',
  'base64',
)

async function asShop(page: Page) {
  expect((await page.request.get('/test/sign-in?account=shop')).status()).toBe(200)
}

/** Taps a button that runs a Server Action and waits for its answer. */
async function tap(page: Page, name: string | RegExp) {
  await Promise.all([
    page.waitForResponse((r) => r.request().method() === 'POST'),
    page.getByRole('button', { name, exact: typeof name === 'string' }).click(),
  ])
  await page.waitForLoadState('networkidle')
}

const error = (page: Page, id: string) => page.locator(`#${id}-error`)
const card = (page: Page, name: string) => page.locator(`[data-dish-card="${name}"]`)
const rows = (page: Page) => page.locator('li[data-group-row]')

async function photos(page: Page): Promise<string[]> {
  return (await page.request.get('/test/files?list=1&prefix=dishes/')).json()
}

/** Picks a photo and waits until its upload has answered and Save can be tapped again. */
async function upload(page: Page, file: { name: string; mimeType: string; buffer: Buffer }) {
  await Promise.all([page.waitForResponse((r) => r.request().method() === 'PUT'), page.getByLabel('Tải ảnh lên').setInputFiles(file)])
  await expect(page.getByRole('button', { name: 'Lưu', exact: true })).toBeEnabled()
}

async function openForm(page: Page, dish?: string) {
  if (dish) await page.getByRole('button', { name: `Sửa ${dish}` }).click()
  else await page.getByRole('button', { name: 'Thêm món' }).click()
  await expect(page.locator('#dish-name')).toBeVisible()
}

/** A ready meal with its price; the form is open. */
async function readyMeal(page: Page, name: string, price: string) {
  await openForm(page)
  await page.locator('#dish-name').fill(name)
  await page.getByLabel('Phần ăn sẵn').check()
  await page.locator('#dish-price').fill(price)
}

test('AC213 H19 with no group yet, "Build-your-own dish" cannot be ticked, with the hint', async ({ page }) => {
  await asShop(page)
  await page.goto('/shop/dishes')
  await openForm(page)
  await expect(page.getByLabel('Món của cơm tự chọn')).toBeDisabled()
  await expect(page.getByText('Thêm nhóm ở màn Cơm tự chọn trước')).toBeVisible()
})

test('AC73 AC200 AC205 AC207 P12 H6 H11 H13 the rules screen saves nothing while a field is wrong, then everything at once', async ({
  page,
}) => {
  await asShop(page)
  await page.goto('/shop/rules')
  await expect(page.locator('#rules-base-price')).toHaveValue('')
  await page.locator('#rules-base-price').fill('35.000')
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: '+ Thêm nhóm' }).click()
  const fill = async (i: number, v: { name: string; min: string; max: string; included: string; fee: string }) => {
    const r = rows(page).nth(i)
    await r.getByLabel('Tên nhóm', { exact: true }).fill(v.name)
    await r.getByLabel('Tối thiểu', { exact: true }).fill(v.min)
    await r.getByLabel('Tối đa', { exact: true }).fill(v.max)
    await r.getByLabel('Kèm sẵn', { exact: true }).fill(v.included)
    await r.getByLabel('Phí thêm món', { exact: true }).fill(v.fee)
  }
  await fill(0, { name: 'Món mặn', min: '2', max: '1', included: '1', fee: '10.000' })
  await fill(1, { name: 'Rau', min: '1', max: '2', included: '3', fee: '' })
  await fill(2, { name: 'Canh', min: '0', max: '21', included: '1', fee: '-5.000' })
  await tap(page, 'Lưu')
  await expect(rows(page).nth(0).getByText('Tối thiểu không được lớn hơn tối đa')).toBeVisible()
  await expect(rows(page).nth(1).getByText('Số kèm sẵn không được lớn hơn tối đa')).toBeVisible()
  await expect(rows(page).nth(1).getByText('Bắt buộc')).toBeVisible()
  await expect(rows(page).nth(2).getByText('Tối đa 20')).toBeVisible()
  await expect(rows(page).nth(2).getByText('Phải là số nguyên từ 0 trở lên')).toBeVisible()
  // Nothing was saved.
  await page.reload()
  await expect(page.locator('#rules-base-price')).toHaveValue('')
  await expect(rows(page)).toHaveCount(0)

  await page.locator('#rules-base-price').fill('35.000')
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: '+ Thêm nhóm' }).click()
  await fill(0, { name: 'Món mặn', min: '1', max: '2', included: '1', fee: '10.000' })
  await fill(1, { name: 'Rau', min: '1', max: '1', included: '1', fee: '0' })
  await fill(2, { name: 'Canh', min: '0', max: '1', included: '1', fee: '5.000' })
  await tap(page, 'Lưu')
  await expect(page.getByRole('status')).toContainText('Đã lưu')
  await page.reload()
  await expect(page.locator('#rules-base-price')).toHaveValue('35.000')
  await expect(rows(page)).toHaveCount(3)
  await expect(rows(page).nth(2).getByLabel('Phí thêm món', { exact: true })).toHaveValue('5.000')
})

test('AC199 H5 an empty group name is Required and a name used twice is refused', async ({ page }) => {
  await asShop(page)
  await page.goto('/shop/rules')
  await page.getByRole('button', { name: '+ Thêm nhóm' }).click()
  await page.getByRole('button', { name: '+ Thêm nhóm' }).click()
  const a = rows(page).nth(3)
  const b = rows(page).nth(4)
  for (const r of [a, b])
    for (const [label, v] of [
      ['Tối thiểu', '0'],
      ['Tối đa', '1'],
      ['Kèm sẵn', '0'],
      ['Phí thêm món', '0'],
    ])
      await r.getByLabel(label, { exact: true }).fill(v)
  await a.getByLabel('Tên nhóm', { exact: true }).fill(' rau ')
  await tap(page, 'Lưu')
  await expect(a.getByText('Đã có nhóm tên này')).toBeVisible()
  await expect(b.getByText('Bắt buộc')).toBeVisible()
  await page.reload()
  await expect(rows(page)).toHaveCount(3)
})

/** The names of the groups on the rules screen, in their order. */
const groupNames = (page: Page) =>
  rows(page)
    .getByLabel('Tên nhóm', { exact: true })
    .evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value))

test('AC218 H24 "Delete group" leaves an undo row until Save; "Keep it" keeps the group', async ({ page }) => {
  await asShop(page)
  await page.goto('/shop/rules')
  await page.getByRole('button', { name: 'Xoá nhóm Canh' }).click()
  await expect(page.getByText('Canh sẽ bị xoá khi bấm Lưu')).toBeVisible()
  await page.getByRole('button', { name: 'Không xoá nữa' }).click()
  await tap(page, 'Lưu')
  await page.reload()
  expect(await groupNames(page)).toEqual(['Món mặn', 'Rau', 'Canh'])
})

test('AC219 H25 a group deleted on another device but still shown here comes back with this Save', async ({ page, context }) => {
  await asShop(page)
  await page.goto('/shop/rules')
  const phone = await secondDevice(context)
  await phone.goto('/shop/rules')
  await phone.getByRole('button', { name: 'Xoá nhóm Canh' }).click()
  await tap(phone, 'Lưu')
  expect(await groupNames(phone)).toEqual(['Món mặn', 'Rau'])
  await phone.context().close()
  await page.locator('#rules-base-price').fill('36.000')
  await tap(page, 'Lưu')
  await page.reload()
  await expect(page.locator('#rules-base-price')).toHaveValue('36.000')
  expect(await groupNames(page)).toEqual(['Món mặn', 'Rau', 'Canh'])
})

test('AC212 H18 every group deleted can be saved; then the three groups are added again', async ({ page }) => {
  await asShop(page)
  await page.goto('/shop/rules')
  for (const name of ['Món mặn', 'Rau', 'Canh']) await page.getByRole('button', { name: `Xoá nhóm ${name}` }).click()
  await tap(page, 'Lưu')
  await page.reload()
  await expect(page.getByText('Chưa có nhóm nào.')).toBeVisible()
  const groups = [
    ['Món mặn', '1', '2', '1', '10.000'],
    ['Rau', '1', '1', '1', '0'],
    ['Canh', '0', '1', '1', '5.000'],
  ]
  for (const [i, [name, min, max, included, fee]] of groups.entries()) {
    await page.getByRole('button', { name: '+ Thêm nhóm' }).click()
    const r = rows(page).nth(i)
    await r.getByLabel('Tên nhóm', { exact: true }).fill(name)
    await r.getByLabel('Tối thiểu', { exact: true }).fill(min)
    await r.getByLabel('Tối đa', { exact: true }).fill(max)
    await r.getByLabel('Kèm sẵn', { exact: true }).fill(included)
    await r.getByLabel('Phí thêm món', { exact: true }).fill(fee)
  }
  await page.locator('#rules-base-price').fill('35.000')
  await tap(page, 'Lưu')
  await page.reload()
  expect(await groupNames(page)).toEqual(['Món mặn', 'Rau', 'Canh'])
})

test('AC77 AC195 AC202 AC203 AC207 Q1 H1 H8 H9 H13 the dish form refuses wrong values under the field', async ({ page }) => {
  await asShop(page)
  await page.goto('/shop/dishes')
  await openForm(page)
  await page.locator('#dish-name').fill('Nước sâm')
  await tap(page, 'Lưu')
  await expect(error(page, 'dish-kind')).toHaveText('Chọn ít nhất một: phần ăn sẵn hoặc món của cơm tự chọn')
  await page.getByLabel('Phần ăn sẵn').check()
  for (const bad of ['-5.000', '45,5', 'abc']) {
    await page.locator('#dish-price').fill(bad)
    await tap(page, 'Lưu')
    await expect(error(page, 'dish-price')).toHaveText('Phải là số nguyên từ 0 trở lên')
  }
  await page.locator('#dish-price').fill('10.000.001')
  await tap(page, 'Lưu')
  await expect(error(page, 'dish-price')).toHaveText('Tối đa 10.000.000 ₫')
  await page.locator('#dish-price').fill('20.000')
  await page.locator('#dish-name').fill('ơ'.repeat(81))
  await page.locator('#dish-description').fill('ơ'.repeat(201))
  await tap(page, 'Lưu')
  await expect(error(page, 'dish-name')).toHaveText('Tối đa 80 ký tự')
  await expect(error(page, 'dish-description')).toHaveText('Tối đa 200 ký tự')
  // A message disappears as soon as its field is edited (CN-76).
  await page.locator('#dish-name').fill('ơ'.repeat(80))
  await expect(error(page, 'dish-name')).toHaveCount(0)
  await page.locator('#dish-name').fill('Nước sâm')
  await page.locator('#dish-description').fill('ơ'.repeat(200))
  await tap(page, 'Lưu')
  await expect(card(page, 'Nước sâm')).toContainText('Phần ăn sẵn · 20.000 ₫')
})

test('AC77 AC202 Q1 H8 "Cơm sườn ram" at 45.000, 45 000 or 45000; "Trứng chiên" with surcharge 0', async ({ page }) => {
  await asShop(page)
  await page.goto('/shop/dishes')
  await readyMeal(page, 'Cơm sườn ram', '45 000')
  await tap(page, 'Lưu')
  await expect(card(page, 'Cơm sườn ram')).toContainText('45.000 ₫')
  await openForm(page, 'Cơm sườn ram')
  await expect(page.locator('#dish-price')).toHaveValue('45.000')
  await page.locator('#dish-price').fill('45000')
  await tap(page, 'Lưu')
  await openForm(page)
  await page.locator('#dish-name').fill('Trứng chiên')
  await page.getByLabel('Món của cơm tự chọn').check()
  await page.locator('#dish-group').selectOption({ label: 'Món mặn' })
  await page.locator('#dish-surcharge').fill('-5.000')
  await tap(page, 'Lưu')
  await expect(error(page, 'dish-surcharge')).toHaveText('Phải là số nguyên từ 0 trở lên')
  await page.locator('#dish-surcharge').fill('0')
  await page.locator('#dish-name-en').fill('Fried egg')
  await tap(page, 'Lưu')
  await expect(card(page, 'Trứng chiên')).toContainText('Món mặn · phụ thu 0 ₫')
})

test('AC205 H11 an empty surcharge is Required', async ({ page }) => {
  await asShop(page)
  await page.goto('/shop/dishes')
  await openForm(page)
  await page.locator('#dish-name').fill('Đậu hũ sốt cà')
  await page.getByLabel('Món của cơm tự chọn').check()
  await page.locator('#dish-group').selectOption({ label: 'Món mặn' })
  await tap(page, 'Lưu')
  await expect(error(page, 'dish-surcharge')).toHaveText('Bắt buộc')
})

test('AC206 AC214 H12 H20 in English: 45,000 and 45 000 and 45.000 are 45,000; 45.5 and 45,5 are refused', async ({ page, context }) => {
  await asShop(page)
  await context.addCookies([{ name: 'lang', value: 'en', url: BASE }])
  await page.goto('/shop/dishes')
  await page.getByRole('button', { name: 'Edit Cơm sườn ram' }).click()
  await expect(page.locator('#dish-price')).toHaveValue('45,000')
  for (const typed of ['45,000', '45 000', '45.000']) {
    await page.locator('#dish-price').fill(typed)
    await tap(page, 'Save')
    await expect(card(page, 'Cơm sườn ram')).toContainText('45,000 ₫')
    await page.getByRole('button', { name: 'Edit Cơm sườn ram' }).click()
    await expect(page.locator('#dish-price')).toHaveValue('45,000')
  }
  for (const bad of ['45.5', '45,5']) {
    await page.locator('#dish-price').fill(bad)
    await tap(page, 'Save')
    await expect(error(page, 'dish-price')).toHaveText('Must be a whole number of 0 or more')
  }
  // In Vietnamese, "45,000" (the English way) is 45,000 too (AC214).
  await context.addCookies([{ name: 'lang', value: 'vi', url: BASE }])
  await page.goto('/shop/dishes')
  await openForm(page, 'Cơm sườn ram')
  await page.locator('#dish-price').fill('45,000')
  await tap(page, 'Lưu')
  await openForm(page, 'Cơm sườn ram')
  await expect(page.locator('#dish-price')).toHaveValue('45.000')
})

test('AC199 AC208 H5 H14 a dish name used twice is refused, also one no longer sold; inner spaces and English names may repeat', async ({
  page,
}) => {
  await asShop(page)
  await page.goto('/shop/dishes')
  await openForm(page, 'Trứng chiên')
  await tap(page, 'Ngừng bán')
  await expect(card(page, 'Trứng chiên')).toContainText('Ngừng bán')
  await readyMeal(page, ' trứng chiên ', '20.000')
  await tap(page, 'Lưu')
  await expect(error(page, 'dish-name')).toHaveText('Đã có món tên này')
  await page.locator('#dish-name').fill('Trứng  chiên')
  await tap(page, 'Lưu')
  await expect(card(page, 'Trứng  chiên')).toBeVisible()
  await readyMeal(page, 'Trứng ốp la', '20.000')
  await page.locator('#dish-name-en').fill('Fried egg')
  await tap(page, 'Lưu')
  await expect(card(page, 'Trứng ốp la')).toBeVisible()
})

test('AC204 H2 H10 dishes sold by name A–Z, then those not sold; "Sell again" brings one back', async ({ page }) => {
  await asShop(page)
  await page.goto('/shop/dishes')
  for (const [name, price] of [
    ['Rau muống xào', '15.000'],
    ['Cá kho tộ', '40.000'],
    ['Ấp chả', '30.000'],
    ['Bún bò Huế', '45.000'],
    ['Canh bí đỏ', '10.000'],
  ]) {
    await readyMeal(page, name, price)
    await tap(page, 'Lưu')
  }
  for (const name of ['Bún bò Huế', 'Canh bí đỏ']) {
    await openForm(page, name)
    await tap(page, 'Ngừng bán')
  }
  const names = await page.locator('[data-dish-card]').evaluateAll((els) => els.map((e) => e.getAttribute('data-dish-card')))
  const sold = ['Ấp chả', 'Cá kho tộ', 'Cơm sườn ram', 'Nước sâm', 'Rau muống xào', 'Trứng  chiên', 'Trứng ốp la']
  expect(names).toEqual([...sold, 'Bún bò Huế', 'Canh bí đỏ', 'Trứng chiên'])
  await tap(page, 'Bán lại Bún bò Huế')
  await expect(card(page, 'Bún bò Huế')).not.toContainText('Ngừng bán')
  const again = await page.locator('[data-dish-card]').evaluateAll((els) => els.map((e) => e.getAttribute('data-dish-card')))
  expect(again.slice(0, 3)).toEqual(['Ấp chả', 'Bún bò Huế', 'Cá kho tộ'])
})

test('AC197 AC210 H3 H16 R1 photos: upload, replace, remove; the old file leaves the bucket; WebP and a moving GIF are accepted', async ({
  page,
}) => {
  await asShop(page)
  await page.goto('/shop/dishes')
  const before = await photos(page)
  await openForm(page, 'Cá kho tộ')
  // The radio is visually hidden inside its tile: tap the tile.
  await page.locator('label', { has: page.getByRole('radio', { name: 'Cá kho' }) }).click()
  await expect(page.getByRole('radio', { name: 'Cá kho' })).toBeChecked()
  await upload(page, { name: 'ca.png', mimeType: 'image/png', buffer: PNG })
  await expect(page.locator('section [data-photo]')).toBeVisible()
  await tap(page, 'Lưu')
  await expect(card(page, 'Cá kho tộ').locator('[data-photo]')).toBeVisible()
  const first = (await photos(page)).filter((p) => !before.includes(p))
  expect(first).toHaveLength(1)

  await openForm(page, 'Cá kho tộ')
  await upload(page, { name: 'ca.webp', mimeType: 'image/webp', buffer: WEBP })
  await expect(page.locator('#dish-photo-error')).toHaveCount(0)
  await tap(page, 'Lưu')
  const second = (await photos(page)).filter((p) => !before.includes(p))
  expect(second).toHaveLength(1)
  expect(second).not.toEqual(first)

  await openForm(page, 'Cá kho tộ')
  await upload(page, { name: 'ca.gif', mimeType: 'image/gif', buffer: GIF })
  await expect(page.locator('#dish-photo-error')).toHaveCount(0)
  await tap(page, 'Lưu')

  await openForm(page, 'Cá kho tộ')
  await page.getByRole('button', { name: 'Xoá ảnh' }).click()
  await tap(page, 'Lưu')
  await expect(card(page, 'Cá kho tộ').locator('[data-photo]')).toHaveCount(0)
  await expect(card(page, 'Cá kho tộ').locator('svg[data-dish="d-cakho"]')).toBeVisible()
  expect((await photos(page)).filter((p) => !before.includes(p))).toEqual([])
  // A file that is not an image (BR-29b).
  await openForm(page, 'Cá kho tộ')
  await page.getByLabel('Tải ảnh lên').setInputFiles({ name: 'menu.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') })
  await expect(page.locator('#dish-photo-error')).toHaveText('Chỉ nhận ảnh (JPG, PNG)')
})

test('AC197 H3 R1 a dish with no drawing that loses its photo shows a plain rice bowl', async ({ page }) => {
  await asShop(page)
  await page.goto('/shop/dishes')
  await openForm(page, 'Ấp chả')
  await upload(page, { name: 'a.png', mimeType: 'image/png', buffer: PNG })
  await expect(page.locator('section [data-photo]')).toBeVisible()
  await tap(page, 'Lưu')
  await openForm(page, 'Ấp chả')
  await page.getByRole('button', { name: 'Xoá ảnh' }).click()
  await tap(page, 'Lưu')
  await expect(card(page, 'Ấp chả').locator('svg[data-dish=""]')).toBeVisible()
})

test('AC217 H23 a photo the server refuses at Save: nothing saved, the earlier photo back, and the next Save keeps the other edits', async ({
  page,
  context,
}) => {
  await asShop(page)
  await page.goto('/shop/dishes')
  await openForm(page, 'Cá kho tộ')
  await upload(page, { name: 'c.png', mimeType: 'image/png', buffer: PNG })
  await tap(page, 'Lưu')
  const src = await card(page, 'Cá kho tộ').locator('[data-photo]').getAttribute('src')
  await context.addCookies([{ name: 'test_upload_bad', value: '1', url: BASE }])
  await openForm(page, 'Cá kho tộ')
  await page.locator('#dish-price').fill('50.000')
  await upload(page, { name: 'bad.png', mimeType: 'image/png', buffer: PNG })
  await tap(page, 'Lưu')
  await expect(page.locator('#dish-photo-error')).toHaveText('Chưa tải được ảnh, vui lòng thử lại')
  await expect(page.locator('section[aria-label="Sửa Cá kho tộ"] [data-photo]')).toHaveAttribute('src', src ?? '')
  await expect(card(page, 'Cá kho tộ')).toContainText('40.000 ₫')
  await tap(page, 'Lưu')
  await expect(card(page, 'Cá kho tộ')).toContainText('50.000 ₫')
  await expect(card(page, 'Cá kho tộ').locator('[data-photo]')).toHaveAttribute('src', src ?? '')
  await context.clearCookies({ name: 'test_upload_bad' })
})

test('AC220 H26 "Stop selling" in the form: the dish is not sold and the price typed is not saved', async ({ page }) => {
  await asShop(page)
  await page.goto('/shop/dishes')
  await openForm(page, 'Bún bò Huế')
  await page.locator('#dish-price').fill('99.000')
  await tap(page, 'Ngừng bán')
  await expect(card(page, 'Bún bò Huế')).toContainText('Ngừng bán')
  await expect(card(page, 'Bún bò Huế')).toContainText('45.000 ₫')
  await expect(card(page, 'Bún bò Huế').getByRole('button', { name: 'Bán lại Bún bò Huế' })).toBeVisible()
})

test('AC216 H22 in English the shop still sees the Vietnamese name', async ({ page, context }) => {
  await asShop(page)
  await context.addCookies([{ name: 'lang', value: 'en', url: BASE }])
  await page.goto('/shop/dishes')
  await expect(card(page, 'Trứng chiên').getByRole('heading')).toHaveText('Trứng chiên')
  await expect(page.getByText('Fried egg')).toHaveCount(0)
})

test('AC211 H17 a failed upload: the message under the photo, and Save keeps the earlier photo', async ({ page, context }) => {
  await asShop(page)
  await page.goto('/shop/dishes')
  await openForm(page, 'Rau muống xào')
  await upload(page, { name: 'r.png', mimeType: 'image/png', buffer: PNG })
  await tap(page, 'Lưu')
  await expect(card(page, 'Rau muống xào').locator('[data-photo]')).toBeVisible()
  const src = await card(page, 'Rau muống xào').locator('[data-photo]').getAttribute('src')
  await context.addCookies([{ name: 'test_upload_fail', value: '1', url: BASE }])
  await openForm(page, 'Rau muống xào')
  await upload(page, { name: 'r2.png', mimeType: 'image/png', buffer: PNG })
  await expect(page.locator('#dish-photo-error')).toHaveText('Chưa tải được ảnh, vui lòng thử lại')
  await tap(page, 'Lưu')
  await expect(card(page, 'Rau muống xào').locator('[data-photo]')).toHaveAttribute('src', src ?? '')
})

test('AC198 H4 a group is added, moved and deleted; a group with a dish no longer sold cannot be deleted', async ({ page }) => {
  await asShop(page)
  // "Canh bí đỏ" (not sold) becomes a dish of "Canh".
  await page.goto('/shop/dishes')
  await openForm(page, 'Canh bí đỏ')
  await page.getByLabel('Món của cơm tự chọn').check()
  await page.locator('#dish-group').selectOption({ label: 'Canh' })
  await page.locator('#dish-surcharge').fill('0')
  await tap(page, 'Lưu')

  await page.goto('/shop/rules')
  await page.getByRole('button', { name: '+ Thêm nhóm' }).click()
  const dessert = rows(page).nth(3)
  await dessert.getByLabel('Tên nhóm', { exact: true }).fill('Tráng miệng')
  for (const [label, v] of [
    ['Tối thiểu', '0'],
    ['Tối đa', '1'],
    ['Kèm sẵn', '0'],
    ['Phí thêm món', '0'],
  ])
    await dessert.getByLabel(label, { exact: true }).fill(v)
  await page.getByRole('button', { name: 'Lên Tráng miệng' }).click()
  await tap(page, 'Lưu')
  await page.reload()
  await expect(rows(page).nth(2).getByLabel('Tên nhóm', { exact: true })).toHaveValue('Tráng miệng')
  await expect(rows(page).nth(3).getByLabel('Tên nhóm', { exact: true })).toHaveValue('Canh')

  await page.getByRole('button', { name: 'Xoá nhóm Tráng miệng' }).click()
  await tap(page, 'Lưu')
  await page.reload()
  await expect(rows(page)).toHaveCount(3)

  await page.getByRole('button', { name: 'Xoá nhóm Canh' }).click()
  await tap(page, 'Lưu')
  await expect(page.getByText('Nhóm còn món, hãy chuyển món sang nhóm khác trước')).toBeVisible()
  await page.reload()
  await expect(rows(page)).toHaveCount(3)
})

/** A second browser of the shop account, as a second device. */
async function secondDevice(context: BrowserContext): Promise<Page> {
  const other = await context.browser()!.newContext()
  const page = await other.newPage()
  await asShop(page)
  return page
}

/** Adds a group with no dish on the rules screen and saves. */
async function addGroup(page: Page, name: string) {
  await page.goto('/shop/rules')
  await page.getByRole('button', { name: '+ Thêm nhóm' }).click()
  const r = rows(page).last()
  await r.getByLabel('Tên nhóm', { exact: true }).fill(name)
  for (const [label, v] of [
    ['Tối thiểu', '0'],
    ['Tối đa', '1'],
    ['Kèm sẵn', '0'],
    ['Phí thêm món', '0'],
  ])
    await r.getByLabel(label, { exact: true }).fill(v)
  await tap(page, 'Lưu')
  await expect(page.getByRole('status')).toContainText('Đã lưu')
}

test('AC213 H19 the group picked in the open form is deleted on another device: Required, and the groups load again', async ({
  page,
  context,
}) => {
  await asShop(page)
  await addGroup(page, 'Phụ')
  await page.goto('/shop/dishes')
  await openForm(page)
  await page.locator('#dish-name').fill('Dưa leo')
  await page.getByLabel('Món của cơm tự chọn').check()
  await page.locator('#dish-group').selectOption({ label: 'Phụ' })
  await page.locator('#dish-surcharge').fill('0')
  const other = await secondDevice(context)
  await other.goto('/shop/rules')
  await other.getByRole('button', { name: 'Xoá nhóm Phụ' }).click()
  await tap(other, 'Lưu')
  await other.context().close()
  await tap(page, 'Lưu')
  await expect(error(page, 'dish-group')).toHaveText('Bắt buộc')
  await expect(page.locator('#dish-group option', { hasText: 'Phụ' })).toHaveCount(0)
})

test('AC209 AC215 H15 H21 two devices: the last Save wins, except a group that now has a dish', async ({ page, context }) => {
  await asShop(page)
  await page.goto('/shop/rules')
  // The computer opens the rules first.
  const phone = await secondDevice(context)
  await addGroup(phone, 'Ăn kèm')
  await addGroup(phone, 'Nước')
  await phone.goto('/shop/dishes')
  await openForm(phone)
  await phone.locator('#dish-name').fill('Chè đậu')
  await phone.getByLabel('Món của cơm tự chọn').check()
  await phone.locator('#dish-group').selectOption({ label: 'Nước' })
  await phone.locator('#dish-surcharge').fill('5.000')
  await tap(phone, 'Lưu')
  await phone.context().close()

  await page.locator('#rules-base-price').fill('40.000')
  await tap(page, 'Lưu')
  await expect(page.getByRole('status')).toContainText('Đã lưu')
  await expect(page.locator('#rules-base-price')).toHaveValue('40.000')
  // "Ăn kèm" (no dish) is gone; "Nước" (with "Chè đậu") stays and shows at once.
  const names = await rows(page)
    .getByLabel('Tên nhóm', { exact: true })
    .evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value))
  expect(names).toEqual(['Món mặn', 'Rau', 'Canh', 'Nước'])
})

test('AC201 H7 the shop comes back to the shop page it came from, never a 404; a customer never to /shop', async ({ page, browser }) => {
  await page.goto('/shop/dishes')
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fshop%2Fdishes$/)
  await page.locator('#field-identifier:visible').fill(TEST_ACCOUNTS.shop.email)
  await page.locator('#field-password:visible').fill(TEST_PASSWORD)
  await Promise.all([page.waitForURL(/\/shop\/dishes$/), page.locator('form:not([data-google]) button[type=submit]:visible').click()])
  await page.goto('/sign-in?next=/shop/old-menu')
  await expect(page).toHaveURL(/\/shop$/)
  await page.goto('/sign-in?next=/proto')
  await expect(page).toHaveURL(/\/shop$/)
  await page.goto('/shop/old-menu')
  await expect(page).toHaveURL(/\/shop$/)
  await expect(page.getByRole('heading', { name: 'Xin chào shop' })).toBeVisible()

  const customer = await (await browser.newContext()).newPage()
  await signIn(customer, TEST_ACCOUNTS.customer.email, TEST_PASSWORD, '/sign-in?next=/shop/dishes')
  await expect(customer).toHaveURL(/127\.0\.0\.1:3100\/$/)
  await customer.goto('/shop/old-menu')
  await expect(customer).toHaveURL(/127\.0\.0\.1:3100\/$/)
  await customer.context().close()
})
