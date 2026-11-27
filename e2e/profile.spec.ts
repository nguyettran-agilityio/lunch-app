// The profile, S-C2, and the email change of M1-5 (BR-16, BR-29a, BR-30, CN-64, CN-65, CN-66,
// CN-76, CN-77, CN-78) on the e2e server in the test sign-in mode: every link comes from the
// test mailbox, and the clock of B59 moves time. Each test makes its own accounts. Test names
// give AC ids and scenario ids, not the CN ids many criteria cite (X7).
import { expect, test, type Page } from '@playwright/test'
import { TEST_PASSWORD } from '@/server/auth/test-accounts'
import {
  PASSWORD,
  SUBMIT,
  confirmedAccount,
  confirmedOnProfile,
  fieldError,
  fresh,
  googleAs,
  mailbox,
  notice,
  proposeBuilding,
  saveProfile,
  setClock,
  signIn,
  signOut,
  signUp,
  tapGoogle,
} from './helpers'

const emailField = (page: Page) => page.locator('#field-email:visible')
const waitingLine = (page: Page) => page.getByText(/Đang chờ xác nhận .*@|Waiting for confirmation of /)
const saved = (page: Page) => page.getByRole('status').filter({ hasText: /Đã lưu hồ sơ|Profile saved/ })
const expiredHeading = (page: Page) => page.getByRole('heading', { name: /Link đã hết hạn|The link has expired/ })
const sendNewLink = (page: Page) => page.getByRole('button', { name: /Gửi link mới|Send a new link/ })
/** Back on the profile from an email-change link: the new email and the notice (AC179). */
async function emailChangedTo(page: Page, email: string) {
  await expect(page).toHaveURL(/\/profile/)
  await expect(page.getByText(new RegExp(`(Đã đổi email thành|Your email was changed to) ${email}`))).toBeVisible()
}

/** A confirmed customer with a complete profile, on /profile. */
async function customer(page: Page, tag: string) {
  const a = fresh(tag)
  await confirmedAccount(page, a)
  await page.goto('/profile')
  return a
}

async function changeEmail(page: Page, email: string) {
  await emailField(page).fill(email)
  await saveProfile(page)
}

const changeMails = async (page: Page, email: string) => (await mailbox(page, email)).filter((m) => m.kind === 'email_change')

async function profileOf(page: Page, email: string) {
  return (await page.request.get(`/test/profile?email=${encodeURIComponent(email)}`)).json()
}

test('AC76 AC97 AC166 P15 X3 C5 a confirmed sign-up opens the profile first; a name message goes as soon as it is edited', async ({
  page,
}) => {
  const a = fresh('p-new')
  // The sign-up form asks only for the phone number, the email and the password (AC76).
  await page.goto('/sign-up')
  await expect(page.locator('form:not([data-google]) input:visible')).toHaveCount(3)
  for (const f of ['phone', 'email', 'password']) await expect(page.locator(`#field-${f}:visible`)).toBeVisible()
  await confirmedOnProfile(page, a)
  await expect(page.getByRole('heading', { name: /Hoàn tất hồ sơ|Complete your profile/ })).toBeVisible()
  await expect(page.locator('#field-phone:visible')).toHaveValue(`${a.phone.slice(0, 4)} ${a.phone.slice(4, 7)} ${a.phone.slice(7)}`)
  await saveProfile(page)
  await expect(fieldError(page, 'name')).toHaveText(/Bắt buộc|Required/)
  await page.locator('#field-name:visible').fill('Lan')
  await expect(fieldError(page, 'name')).toHaveCount(0)
  await saveProfile(page)
  await expect(fieldError(page, 'name')).toHaveCount(0)
  await expect(fieldError(page, 'buildingId')).toHaveText(/Bắt buộc|Required/)
})

test('AC103 AC183 X9 K13 the name rule; a building proposed with no address is selected at once and kept when leaving', async ({
  page,
}) => {
  const a = fresh('p-name')
  await confirmedOnProfile(page, a)
  await page.locator('#field-name:visible').fill('a'.repeat(81))
  await saveProfile(page)
  await expect(fieldError(page, 'name')).toHaveText(/Tối đa 80 ký tự|At most 80 characters/)
  await proposeBuilding(page, 'Tòa ABC')
  await expect(page.locator('#field-buildingId:visible option:checked')).toHaveText(/Tòa ABC/)
  await page.goto('/')
  await page.goto('/profile')
  await expect(page.getByRole('heading', { name: /Hoàn tất hồ sơ|Complete your profile/ })).toBeVisible()
  await expect(page.locator('#field-buildingId:visible option', { hasText: 'Tòa ABC (chờ shop duyệt)' })).toHaveCount(1)
  expect(await (await page.request.get(`/test/buildings?email=${a.email}`)).json()).toEqual([
    { name: 'Tòa ABC', state: 'pending', address: '' },
  ])
})

test('AC103 AC92 W1 a new Google customer: the profile first, the Google name prefilled, the email not editable, a taken phone refused', async ({
  page,
  context,
}) => {
  const a = fresh('p-google')
  await googleAs(context, { email: a.email, name: 'Trần Thị Lan' })
  await page.goto('/sign-in')
  await tapGoogle(page)
  await expect(page).toHaveURL(/\/profile$/)
  await expect(page.locator('#field-name:visible')).toHaveValue('Trần Thị Lan')
  await expect(emailField(page)).toHaveValue(a.email)
  await expect(emailField(page)).toHaveAttribute('readonly', '')
  await expect(page.getByText(/Email của tài khoản Google không đổi được|The email of a Google account cannot be changed/)).toBeVisible()
  // The phone of an account waiting for confirmation is refused at profile completion (AC92).
  const waiting = fresh('p-google-w')
  const other = await page.context().browser()!.newContext()
  await signUp(await other.newPage(), waiting)
  await other.close()
  await page.locator('#field-phone:visible').fill(waiting.phone)
  await proposeBuilding(page, 'Tòa G')
  await saveProfile(page)
  await expect(fieldError(page, 'phone')).toHaveText(/đang chờ xác nhận email|waiting for its email to be confirmed/)
  // The waiting account stays (AC92).
  expect(await profileOf(page, waiting.email)).toMatchObject({ phone: waiting.phone })
  await page.locator('#field-phone:visible').fill('0912345678')
  await saveProfile(page)
  await expect(fieldError(page, 'phone')).toHaveText(/Số điện thoại này đã có tài khoản|This phone number already has an account/)
  await page.locator('#field-phone:visible').fill(a.phone)
  await saveProfile(page)
  await expect(page).toHaveURL(/\/$/)
})

test('AC54 AC92 A11 A12 A13 W1 the phone and the email change; a Google account cannot change its email', async ({ page, browser }) => {
  const waiting = fresh('p-wait')
  await signUp(page, waiting)
  const a = await customer(page, 'p-change')
  await page.locator('#field-phone:visible').fill(waiting.phone)
  await saveProfile(page)
  await expect(fieldError(page, 'phone')).toHaveText(/đang chờ xác nhận email|waiting for its email to be confirmed/)
  await expect(page.getByRole('button', { name: /^(Gửi lại|Send again)$/ })).toHaveCount(0)
  await page.locator('#field-phone:visible').fill('0912345678')
  await saveProfile(page)
  await expect(fieldError(page, 'phone')).toHaveText(/đã có tài khoản|already has an account/)
  const free = fresh('p-free')
  await page.locator('#field-phone:visible').fill(free.phone)
  await saveProfile(page)
  await expect(saved(page)).toBeVisible()
  expect((await profileOf(page, a.email)).phone).toBe(free.phone)
  // The email: kept until the link is tapped.
  const next = fresh('p-next').email
  await changeEmail(page, next)
  await expect(waitingLine(page)).toHaveText(new RegExp(next))
  expect((await profileOf(page, a.email)).email).toBe(a.email)
  const google = await browser.newContext()
  const g = await google.newPage()
  await g.request.get('/test/sign-in?account=google')
  await g.goto('/profile')
  await expect(g.locator('#field-email:visible')).toHaveAttribute('readonly', '')
  await google.close()
})

test('AC70 P9 a shop email is refused on the profile', async ({ page }) => {
  await customer(page, 'p-shop')
  await changeEmail(page, 'shop-google@example.test')
  await expect(fieldError(page, 'email')).toHaveText(/dành cho tài khoản của shop|is for a shop account/)
})

test('AC101 AC106 X7 X13 the email of a waiting account and a waiting new email are refused; Lan can still confirm', async ({
  page,
  browser,
}) => {
  const huy = fresh('p-huy')
  await signUp(page, huy)
  const lan = await customer(page, 'p-lan')
  await changeEmail(page, huy.email)
  await expect(fieldError(page, 'email')).toHaveText(/Email này đang chờ xác nhận|This email is waiting for its confirmation/)
  const lan2 = fresh('p-lan2').email
  await changeEmail(page, lan2)
  await expect(waitingLine(page)).toHaveText(new RegExp(lan2))
  await expect(page.getByRole('button', { name: /Gửi lại|Send again/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Huỷ|Hủy|Cancel/ })).toHaveCount(0)
  // Someone else's sign-up and profile change are refused.
  const other = await browser.newContext()
  const o = await other.newPage()
  await signUp(o, { phone: fresh('p-o').phone, email: lan2 })
  await expect(fieldError(o, 'email')).toHaveText(/đang chờ xác nhận|waiting for its confirmation/)
  await confirmedAccount(o, fresh('p-o2'))
  await o.goto('/profile')
  await o.locator('#field-email:visible').fill(lan2)
  await saveProfile(o)
  await expect(fieldError(o, 'email')).toHaveText(/đang chờ xác nhận|waiting for its confirmation/)
  await other.close()
  const [mail] = await changeMails(page, lan2)
  await page.goto(mail.link)
  await emailChangedTo(page, lan2)
  expect((await profileOf(page, lan2)).email).toBe(lan2)
  expect(await profileOf(page, lan.email)).toBeNull()
})

test("AC110 AC128 X17 Z5 a first Google sign-in with Lan's waiting email is refused; Lan can still confirm it", async ({
  page,
  browser,
}) => {
  await customer(page, 'p-gw')
  const lan2 = fresh('p-gw2').email
  await changeEmail(page, lan2)
  const huy = await browser.newContext()
  await googleAs(huy, { email: lan2, name: 'Huy' })
  const h = await huy.newPage()
  await h.goto('/sign-in')
  await tapGoogle(h)
  await expect(h.locator('#google-notice:visible')).toHaveText(/Email này đang chờ xác nhận|This email is waiting for its confirmation/)
  await huy.close()
  await page.goto('/profile')
  await expect(waitingLine(page)).toHaveText(new RegExp(lan2))
  const [mail] = await changeMails(page, lan2)
  await page.goto(mail.link)
  await emailChangedTo(page, lan2)
})

test('AC111 X18 a waiting email whose link expired a day ago stays taken until Lan changes it', async ({ page, context, browser }) => {
  const lan = await customer(page, 'p-day')
  const lan2 = fresh('p-day2').email
  await changeEmail(page, lan2)
  const huy = await browser.newContext()
  const h = await huy.newPage()
  await setClock(huy, 24 * 3600)
  const hPhone = fresh('p-dayh').phone
  await signUp(h, { phone: hPhone, email: lan2 })
  await expect(fieldError(h, 'email')).toHaveText(/đang chờ xác nhận|waiting for its confirmation/)
  await setClock(context, 24 * 3600)
  const lan3 = fresh('p-day3').email
  await changeEmail(page, lan3)
  await expect(waitingLine(page)).toHaveText(new RegExp(lan3))
  await signUp(h, { phone: hPhone, email: lan2 })
  await expect(h.getByRole('heading', { name: /Kiểm tra email|Check your email/ })).toBeVisible()
  await huy.close()
  expect((await profileOf(page, lan.email)).pendingEmail).toBe(lan3)
})

test('AC105 AC109 AC171 X12 X16 K1 an expired email-change link: "Send a new link", no field, sent only when tapped', async ({
  page,
  context,
}) => {
  const a = await customer(page, 'p-exp')
  const lan2 = fresh('p-exp2').email
  await changeEmail(page, lan2)
  const [mail] = await changeMails(page, lan2)
  await setClock(context, 3601)
  await page.goto(mail.link)
  await expect(page).toHaveURL(/\/auth\/expired\?type=email_change/)
  await expect(expiredHeading(page)).toBeVisible()
  await expect(page.locator('input:visible')).toHaveCount(0)
  await page.reload()
  expect(await changeMails(page, lan2)).toHaveLength(1)
  await sendNewLink(page).click()
  await expect(page.getByRole('button', { name: /Gửi lại sau \d+ giây|Send again in \d+ s/ })).toBeVisible()
  expect(await changeMails(page, lan2)).toHaveLength(2)
  // Signed out, the link sends to sign in first, then back here (AC109).
  await signOut(page)
  await page.goto(mail.link)
  await expect(page).toHaveURL(/\/sign-in\?next=/)
  await page.locator('#field-identifier:visible').fill(a.phone)
  await page.locator('#field-password:visible').fill(PASSWORD)
  await page.locator(SUBMIT).click()
  await expect(page).toHaveURL(/\/auth\/expired\?type=email_change/)
  await expect(sendNewLink(page).or(page.getByRole('button', { name: /Gửi lại sau|Send again in/ }))).toBeVisible()
  await expect(page.locator('input:visible')).toHaveCount(0)
})

test('AC172 AC187 K2 K17 the expired page with no new email waiting; the link under the card and the top bar', async ({
  page,
  context,
  browser,
}) => {
  await customer(page, 'p-none')
  const lan2 = fresh('p-none2').email
  await changeEmail(page, lan2)
  const [mail] = await changeMails(page, lan2)
  // Lan, with lan2 waiting: the button, and "Go to the home page" to /.
  await setClock(context, 3601)
  await page.goto(mail.link)
  await expect(sendNewLink(page)).toBeVisible()
  await expect(page.getByRole('link', { name: /Về trang chủ|Go to the home page/ })).toHaveAttribute('href', '/')
  // Huy, with no new email waiting.
  const huy = await browser.newContext()
  const h = await huy.newPage()
  await confirmedAccount(h, fresh('p-none-h'))
  await setClock(huy, 3601)
  await h.goto(mail.link)
  await expect(expiredHeading(h)).toBeVisible()
  await expect(h.getByText(/không có email mới nào đang chờ xác nhận|No new email is waiting for confirmation/)).toBeVisible()
  await expect(sendNewLink(h)).toHaveCount(0)
  await huy.close()
  // Lan herself, once she confirmed lan2 through a newer link (AC172).
  await setClock(context, 3700)
  await page.goto('/profile')
  await page.getByRole('button', { name: /^(Gửi lại|Send again)$/ }).click()
  await expect(page.getByRole('button', { name: /Gửi lại sau|Send again in/ })).toBeVisible()
  const [newer] = await changeMails(page, lan2)
  await page.goto(newer.link)
  await expect(page).toHaveURL(/\/profile/)
  await page.goto(mail.link)
  await expect(page.getByText(/không có email mới nào đang chờ xác nhận|No new email is waiting for confirmation/)).toBeVisible()
  await expect(sendNewLink(page)).toHaveCount(0)
  // The shop account.
  const shop = await browser.newContext()
  const s = await shop.newPage()
  await s.request.get('/test/sign-in?account=shop')
  await setClock(shop, 3601)
  await s.goto(mail.link)
  await expect(s.getByText(/không có email mới nào đang chờ xác nhận|No new email is waiting for confirmation/)).toBeVisible()
  await expect(s.getByRole('link', { name: /Về trang chủ|Go to the home page/ })).toHaveAttribute('href', '/shop')
  await expect(s.locator('summary:visible', { hasText: /Tài khoản|Account/ })).toBeVisible()
  await shop.close()
})

test('AC173 K3 the new link goes to the address waiting now', async ({ page, context }) => {
  await customer(page, 'p-now')
  const lan2 = fresh('p-now2').email
  await changeEmail(page, lan2)
  const [old] = await changeMails(page, lan2)
  await setClock(context, 61)
  const lan3 = fresh('p-now3').email
  await changeEmail(page, lan3)
  await setClock(context, 3700)
  await page.goto(old.link)
  await sendNewLink(page).click()
  await expect(page.getByText(new RegExp(`(Đã gửi link mới tới|A new link was sent to) ${lan3}`))).toBeVisible()
  expect(await changeMails(page, lan3)).toHaveLength(2)
})

test('AC174 K4 the link of a change replaced by a newer one has expired', async ({ page, context, browser }) => {
  const lan = await customer(page, 'p-rep')
  const lan2 = fresh('p-rep2').email
  await changeEmail(page, lan2)
  const [old] = await changeMails(page, lan2)
  await setClock(context, 61)
  const lan3 = fresh('p-rep3').email
  await changeEmail(page, lan3)
  const huy = await browser.newContext()
  const h = await huy.newPage()
  await signUp(h, { phone: fresh('p-reph').phone, email: lan2 })
  await expect(h.getByRole('heading', { name: /Kiểm tra email|Check your email/ })).toBeVisible()
  await huy.close()
  await page.goto(old.link)
  await expect(expiredHeading(page)).toBeVisible()
  await page.goto('/profile')
  await expect(waitingLine(page)).toHaveText(new RegExp(lan3))
  expect((await profileOf(page, lan.email)).pendingEmail).toBe(lan3)
})

test('AC175 AC177 AC184 K5 K7 K14 the own email again: the saved notice, nothing sent; a waiting one is cancelled and its link stops', async ({
  page,
  browser,
}) => {
  const lan = await customer(page, 'p-own')
  await saveProfile(page)
  await expect(saved(page)).toBeVisible()
  await expect(fieldError(page, 'email')).toHaveCount(0)
  const lan2 = fresh('p-own2').email
  await changeEmail(page, lan2)
  await expect(page).toHaveURL(/\/profile/)
  await expect(saved(page)).toBeVisible()
  await expect(waitingLine(page)).toHaveText(new RegExp(lan2))
  const [mail] = await changeMails(page, lan2)
  await changeEmail(page, lan.email)
  await expect(saved(page)).toBeVisible()
  await expect(waitingLine(page)).toHaveCount(0)
  const huy = await browser.newContext()
  const h = await huy.newPage()
  await signUp(h, { phone: fresh('p-ownh').phone, email: lan2 })
  await expect(h.getByRole('heading', { name: /Kiểm tra email|Check your email/ })).toBeVisible()
  await huy.close()
  await page.goto(mail.link)
  await expect(expiredHeading(page)).toBeVisible()
  await expect(page.getByText(/không có email mới nào đang chờ xác nhận|No new email is waiting for confirmation/)).toBeVisible()
  await expect(sendNewLink(page)).toHaveCount(0)
})

test('AC176 AC184 AC191 K6 K14 K21 the Email field holds the waiting email; saving only a new name sends nothing', async ({ page }) => {
  const lan = await customer(page, 'p-fill')
  const lan2 = fresh('p-fill2').email
  await changeEmail(page, lan2)
  await page.goto('/profile')
  await expect(emailField(page)).toHaveValue(lan2)
  await expect(page.getByText(new RegExp(`(Email hiện tại|Current email): ${lan.email}`))).toBeVisible()
  await page.locator('#field-name:visible').fill('Lan Trần')
  await saveProfile(page)
  await expect(saved(page)).toBeVisible()
  expect(await changeMails(page, lan2)).toHaveLength(1)
  expect(await profileOf(page, lan.email)).toMatchObject({ name: 'Lan Trần', pendingEmail: lan2 })
  await expect(page.getByRole('button', { name: /Gửi lại sau \d+ giây|Send again in \d+ s/ })).toBeVisible()
  // Nothing changed at all: still the saved notice, lan2 still waiting, nothing sent (AC184).
  await page.goto('/profile')
  await saveProfile(page)
  await expect(saved(page)).toBeVisible()
  await expect(waitingLine(page)).toHaveText(new RegExp(lan2))
  expect(await changeMails(page, lan2)).toHaveLength(1)
})

test('AC178 K8 a refused field saves nothing; an email that cannot be sent neither', async ({ page }) => {
  const waiting = fresh('p-ref-w')
  await signUp(page, waiting)
  const lan = await customer(page, 'p-ref')
  const lan2 = fresh('p-ref2').email
  await page.locator('#field-name:visible').fill('Lan Trần')
  await page.locator('#field-phone:visible').fill(waiting.phone)
  await emailField(page).fill(lan2)
  await saveProfile(page)
  await expect(fieldError(page, 'phone')).toHaveText(/đang chờ xác nhận email|waiting for its email to be confirmed/)
  expect(await profileOf(page, lan.email)).toMatchObject({ name: 'Khách Thử', pendingEmail: null })
  expect(await changeMails(page, lan2)).toHaveLength(0)
  await page.request.get(`/test/mail-refuse?email=${encodeURIComponent(lan2)}`)
  await page.locator('#field-phone:visible').fill(lan.phone)
  await saveProfile(page)
  await expect(notice(page)).toHaveText(/Chưa gửi được email|Could not send the email/)
  expect(await profileOf(page, lan.email)).toMatchObject({ name: 'Khách Thử', pendingEmail: null })
})

test('AC179 K9 the link signs Lan in, also where nobody or Huy was signed in; then only the new email signs in', async ({
  page,
  browser,
}) => {
  const lan = await customer(page, 'p-link')
  const lan2 = fresh('p-link2').email
  await changeEmail(page, lan2)
  const [mail] = await changeMails(page, lan2)
  // First a phone where nobody is signed in, with a link that will be replaced: signed in as Lan.
  const phone = await browser.newContext()
  const ph = await phone.newPage()
  await ph.goto(mail.link)
  await expect(ph).toHaveURL(/\/profile/)
  await expect(ph.locator('#field-email:visible')).toHaveValue(lan2)
  await phone.close()
  // Then a second change, whose link is opened on a shared computer where Huy is signed in.
  await page.goto('/profile')
  const lan3 = fresh('p-link3').email
  await changeEmail(page, lan3)
  const [mail3] = await changeMails(page, lan3)
  const shared = await browser.newContext()
  const s = await shared.newPage()
  const huy = fresh('p-linkh')
  await confirmedAccount(s, huy)
  await s.goto(mail3.link)
  await expect(s).toHaveURL(/\/profile/)
  await expect(s.getByText(new RegExp(`(Đã đổi email thành|Your email was changed to) ${lan3}`))).toBeVisible()
  await expect(s.locator('#field-email:visible')).toHaveValue(lan3)
  // Lan is signed in there now, not Huy.
  expect((await profileOf(s, lan3)).phone).toBe(lan.phone)
  await signOut(s)
  await signIn(s, lan3)
  await expect(s).toHaveURL(/\/$/)
  await signOut(s)
  for (const old of [lan.email, lan2]) {
    await signIn(s, old)
    await expect(notice(s)).toHaveText(/Không có tài khoản|No account/)
  }
  await shared.close()
})

test('AC194 K24 "Your email was changed to …" shows only once', async ({ page }) => {
  await customer(page, 'p-once')
  const lan2 = fresh('p-once2').email
  await changeEmail(page, lan2)
  const [mail] = await changeMails(page, lan2)
  await page.goto(mail.link)
  const changed = page.getByText(new RegExp(`(Đã đổi email thành|Your email was changed to) ${lan2}`))
  await expect(changed).toBeVisible()
  await expect(page).toHaveURL(/\/profile$/)
  await page.reload()
  await expect(emailField(page)).toHaveValue(lan2)
  await expect(changed).toHaveCount(0)
})

test('AC107 X14 an incomplete customer who opens / signs in to the profile first, then /; the shop from /profile goes to /shop', async ({
  page,
  browser,
}) => {
  const a = fresh('p-107')
  await confirmedOnProfile(page, a)
  await signOut(page)
  await page.goto('/')
  await expect(page).toHaveURL(/\/sign-in$/)
  await signIn(page, a.phone)
  await expect(page).toHaveURL(/\/profile$/)
  await page.locator('#field-name:visible').fill('Lan')
  await proposeBuilding(page, 'Tòa 107')
  await saveProfile(page)
  await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/)
  const shop = await browser.newContext()
  const s = await shop.newPage()
  await signIn(s, 'shop@example.test', TEST_PASSWORD, '/sign-in?next=/profile')
  await expect(s).toHaveURL(/\/shop$/)
  await shop.close()
})

test('AC180 AC181 K10 K11 a Google account\'s phone on the sign-up expired page; a waiting new email on "Forgot password"', async ({
  page,
}) => {
  await page.goto('/auth/expired?type=signup')
  await page.locator('#field-identifier:visible').fill('0938111222')
  await page.locator(SUBMIT).click()
  await expect(notice(page)).toHaveText(/đăng nhập bằng Google|signs in with Google/)
  await page.goto('/forgot-password')
  await page.locator('#field-identifier:visible').fill('lan2@example.test')
  await page.locator(SUBMIT).click()
  await expect(notice(page)).toHaveText(/Không có tài khoản|No account/)
})

test('AC182 K12 the language field changes at once and is saved to the account', async ({ page, browser }) => {
  const lan = await customer(page, 'p-lang')
  await page.locator('#field-lang').selectOption('en')
  await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible()
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /^Hello/ })).toBeVisible()
  const other = await browser.newContext()
  const o = await other.newPage()
  await signIn(o, lan.phone)
  await expect(o.getByRole('heading', { name: /^Hello/ })).toBeVisible()
  await other.close()
})

test('AC185 K15 a new email within its 60-second wait saves nothing; "Send again in N s" under the field', async ({ page, context }) => {
  const lan = await customer(page, 'p-60')
  const lan2 = fresh('p-602').email
  const lan3 = fresh('p-603').email
  await changeEmail(page, lan2)
  await setClock(context, 20)
  await changeEmail(page, lan3)
  await setClock(context, 40)
  await page.locator('#field-name:visible').fill('Lan Trần')
  await changeEmail(page, lan2)
  await expect(fieldError(page, 'email')).toHaveText(/Gửi lại sau (19|20) giây|Send again in (19|20) s/)
  expect(await profileOf(page, lan.email)).toMatchObject({ name: 'Khách Thử', pendingEmail: lan3 })
})

test('AC186 K16 after "Send again" only the newest link works', async ({ page, context }) => {
  await customer(page, 'p-l1')
  const lan2 = fresh('p-l12').email
  await changeEmail(page, lan2)
  await setClock(context, 61)
  await page.goto('/profile')
  await page.getByRole('button', { name: /^(Gửi lại|Send again)$/ }).click()
  await expect(page.getByRole('button', { name: /Gửi lại sau|Send again in/ })).toBeVisible()
  const [l2, l1] = await changeMails(page, lan2)
  await page.goto(l1.link)
  await expect(expiredHeading(page)).toBeVisible()
  await expect(sendNewLink(page).or(page.getByRole('button', { name: /Gửi lại sau|Send again in/ }))).toBeVisible()
  await page.goto(l2.link)
  await emailChangedTo(page, lan2)
})

/** A complete customer whose default building the shop declined (seeded through /test/buildings). */
async function declinedCustomer(page: Page, tag: string, name = 'Tòa ABC') {
  const a = await customer(page, tag)
  const { id } = await (await page.request.post('/test/buildings', { data: { email: a.email, name } })).json()
  await page.goto('/profile')
  return { ...a, declinedId: id as string }
}

test('AC188 K18 a declined building is not offered and cannot be saved again', async ({ page }) => {
  const a = await declinedCustomer(page, 'p-dec')
  await page.locator('#field-name:visible').fill('Lan Trần')
  await expect(
    page.getByText(/Shop không giao tới Tòa ABC; hãy chọn tòa khác|The shop does not deliver to Tòa ABC; pick another building/),
  ).toBeVisible()
  await expect(page.locator('#field-buildingId:visible option', { hasText: /^Tòa ABC/ })).toHaveCount(0)
  await saveProfile(page)
  await expect(fieldError(page, 'buildingId')).toHaveText(/Bắt buộc|Required/)
  // Nothing saved: the name and the declined default stay as they were.
  expect(await profileOf(page, a.email)).toMatchObject({ name: 'Khách Thử', buildingId: a.declinedId })
})

test('AC193 K23 the same name with a new address updates the pending building', async ({ page }) => {
  const a = fresh('p-addr')
  await confirmedOnProfile(page, a)
  await proposeBuilding(page, 'Tòa ABC', '12 Lê Lợi')
  await expect(page.locator('#field-buildingId:visible option:checked')).toHaveText(/Tòa ABC/)
  const first = await page.locator('#field-buildingId:visible').inputValue()
  await page.goto('/')
  await page.goto('/profile')
  await proposeBuilding(page, ' tòa abc ', '34 Hai Bà Trưng')
  // The same building selected each time, and only one in the list (AC193).
  await expect(page.locator('#field-buildingId:visible')).toHaveValue(first)
  await proposeBuilding(page, ' Tòa ABC ')
  await expect(page.locator('#field-buildingId:visible')).toHaveValue(first)
  await expect(page.locator('#field-buildingId:visible option', { hasText: /Tòa ABC/ })).toHaveCount(1)
  const rows: { name: string; state: string; address: string }[] = await (await page.request.get(`/test/buildings?email=${a.email}`)).json()
  expect(rows).toEqual([{ name: 'Tòa ABC', state: 'pending', address: '34 Hai Bà Trưng' }])
})

test('AC189 K19 proposing the same name again reuses the pending building; another name makes a new one', async ({ page }) => {
  const a = fresh('p-again')
  await confirmedOnProfile(page, a)
  await proposeBuilding(page, 'Tòa ABC')
  await page.goto('/')
  await page.goto('/profile')
  await proposeBuilding(page, ' tòa abc ')
  expect(await (await page.request.get(`/test/buildings?email=${a.email}`)).json()).toEqual([
    { name: 'Tòa ABC', state: 'pending', address: '' },
  ])
  await proposeBuilding(page, 'Tòa XYZ')
  expect(await (await page.request.get(`/test/buildings?email=${a.email}`)).json()).toHaveLength(2)
  await expect(page.locator('#field-buildingId:visible option', { hasText: /Tòa (ABC|XYZ)/ })).toHaveCount(2)
})

test('AC190 AC107 K20 X14 an incomplete profile after signing in: the profile first, an email change too, then the page to return to', async ({
  page,
}) => {
  const a = await declinedCustomer(page, 'p-comp')
  await signOut(page)
  await signIn(page, a.phone, PASSWORD, '/sign-in?next=/proto')
  await expect(page).toHaveURL(/\/profile\?next=%2Fproto/)
  await proposeBuilding(page, 'Tòa Mới')
  const lan2 = fresh('p-comp2').email
  await changeEmail(page, lan2)
  await expect(page).toHaveURL(/\/proto$/)
  expect(await changeMails(page, lan2)).toHaveLength(1)
  await page.goto('/profile')
  await expect(waitingLine(page)).toHaveText(new RegExp(lan2))
})

test('AC192 K22 proposing the name of a declined building makes a new pending one', async ({ page }) => {
  const a = await declinedCustomer(page, 'p-redo')
  await proposeBuilding(page, 'Tòa ABC')
  await saveProfile(page)
  await expect(page).toHaveURL(/\/$/)
  const rows: { name: string; state: string }[] = await (await page.request.get(`/test/buildings?email=${a.email}`)).json()
  expect(
    rows
      .filter((b) => b.name === 'Tòa ABC')
      .map((b) => b.state)
      .sort(),
  ).toEqual(['declined', 'pending'])
})

test('AC95 X1 the profile signed out: the sign-in page in English, then back on the profile; /proto open to everyone', async ({
  page,
  browser,
}) => {
  const a = fresh('p-out')
  await confirmedAccount(page, a)
  await signOut(page)
  await page.goto('/profile')
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fprofile/)
  await page
    .getByRole('group', { name: /Ngôn ngữ|Language/ })
    .getByRole('button', { name: 'en' })
    .click()
  await expect(page.getByRole('heading', { name: 'Sign in to order lunch' })).toBeVisible()
  const other = await browser.newContext()
  const tab = await other.newPage()
  await tab.goto('/proto')
  await expect(tab).toHaveURL(/\/proto$/)
  await other.close()
  await page.locator('#field-identifier:visible').fill(a.phone)
  await page.locator('#field-password:visible').fill(PASSWORD)
  await page.locator(SUBMIT).click()
  await expect(page).toHaveURL(/\/profile$/)
})
