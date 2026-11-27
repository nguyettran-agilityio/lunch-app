// Forgot password and the reset page (PR M1-4, docs/test-scenarios.md section 23 and the reset
// parts of A7, A10, A15, A16, P8, Q8, W3, X6, X12 and Y2) on the e2e server in the test sign-in
// mode. A test name starts with the AC ids it completes (X7, B56); no name gives a CN id that an
// AC still in the exception list cites (plan.md PR M1-4, "Tests").
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { TEST_ACCOUNTS, TEST_PASSWORD } from '@/server/auth/test-accounts'
import {
  PASSWORD,
  SUBMIT,
  confirmedAccount,
  fieldError,
  fresh,
  googleAs,
  googleNotice,
  mailbox,
  notice,
  setClock,
  setLang,
  signIn,
  signOut,
  signUp,
  tapGoogle,
} from './helpers'

const google = TEST_ACCOUNTS.google
const NEW_PASSWORD = 'newpass2026'
const home = /127\.0\.0\.1:\d+\/$/
const EXPIRED = /\/auth\/expired\?type=recovery$/
const SAME = 'Mật khẩu mới phải khác mật khẩu cũ'
const SEND_FAILED = 'Chưa gửi được email, vui lòng thử lại sau'
const NOT_CONFIRMED = 'Bạn chưa xác nhận email'

async function session(page: Page): Promise<{ email?: string; role?: string }> {
  return ((await (await page.request.get('/test/session')).json()) as { email?: string; role?: string } | null) ?? {}
}

async function profile(page: Page, email: string): Promise<Record<string, unknown> | null> {
  return (await page.request.get(`/test/profile?email=${encodeURIComponent(email)}`)).json()
}

/** The `test_session` cookie of a page's context. */
async function sessionCookie(context: BrowserContext): Promise<string | undefined> {
  return (await context.cookies()).find((c) => c.name === 'test_session')?.value
}

async function submit(page: Page) {
  await Promise.all([page.waitForResponse((r) => r.request().method() === 'POST'), page.locator(SUBMIT).click()])
  await page.waitForLoadState('networkidle')
}

/** "Forgot password" (or the expired reset page at `path`) for `identifier`. */
async function forgot(page: Page, identifier: string, path = '/forgot-password') {
  await page.goto(path)
  await page.locator('#field-identifier:visible').fill(identifier)
  await submit(page)
}

/** The newest reset link sent to `email`. */
async function resetLink(page: Page, email: string): Promise<string> {
  const mail = (await mailbox(page, email)).find((m) => m.kind === 'recovery')
  expect(mail, `a reset link to ${email}`).toBeTruthy()
  return mail!.link
}

/** Saves `password` on /auth/reset and waits for the answer. */
async function save(page: Page, password: string) {
  await page.locator('#field-password:visible').fill(password)
  await Promise.all([page.waitForResponse((r) => r.request().method() === 'POST'), page.locator(SUBMIT).click()])
  await page.waitForLoadState('networkidle')
}

const sentHeading = (page: Page) => page.getByRole('heading', { name: 'Đã gửi link đặt lại mật khẩu' })
const resetHeading = (page: Page) => page.getByRole('heading', { name: 'Đặt mật khẩu mới' })
const expiredHeading = (page: Page) => page.getByRole('heading', { name: 'Link đã hết hạn' })

async function newPage(browser: Browser): Promise<[BrowserContext, Page]> {
  const context = await browser.newContext()
  return [context, await context.newPage()]
}

test('AC20 AC149 AC151 A16 N7 N9 the link opens the form without signing in; leaving keeps the old password; saving signs in', async ({
  page,
  context,
}) => {
  const a = fresh('ac20')
  await confirmedAccount(page, a)
  await signOut(page)
  await setClock(context, 61)
  await forgot(page, a.phone)
  await expect(sentHeading(page)).toBeVisible()
  const link = await resetLink(page, a.email)
  await page.goto(link)
  await expect(page).toHaveURL(/\/auth\/reset$/)
  await expect(resetHeading(page)).toBeVisible()
  expect(await session(page)).not.toHaveProperty('email')
  // Left without saving: not signed in, the old password still works.
  await page.goto('/')
  await expect(page).toHaveURL(/\/sign-in/)
  await signIn(page, a.phone)
  await expect(page).toHaveURL(home)
  await signOut(page)
  // Later in its hour the link still works until it is saved; saving signs in.
  await setClock(context, 61 + 30 * 60)
  await page.goto(link)
  await save(page, NEW_PASSWORD)
  await expect(page).toHaveURL(home)
  expect(await session(page)).toMatchObject({ email: a.email })
  await signOut(page)
  await signIn(page, a.phone, NEW_PASSWORD)
  await expect(page).toHaveURL(home)
})

test('AC53 A10 the password rule on the reset page', async ({ page, context }) => {
  const a = fresh('ac53')
  await confirmedAccount(page, a)
  await signOut(page)
  await setClock(context, 61)
  await forgot(page, a.email)
  await page.goto(await resetLink(page, a.email))
  for (const pw of ['abc12', 'abcdefgh']) {
    await save(page, pw)
    await expect(fieldError(page, 'password')).toHaveText('Ít nhất 8 ký tự, có cả chữ và số')
  }
  await save(page, 'abcdef12')
  await expect(page).toHaveURL(home)
})

test('AC56 AC143 A15 N1 no account, a Google account email, and the phone on a Google profile', async ({ page }) => {
  await forgot(page, '0987000111')
  await expect(notice(page)).toHaveText('Không có tài khoản nào với số điện thoại hoặc email này')
  for (const id of [google.email, google.phone]) {
    await forgot(page, id)
    await expect(notice(page)).toHaveText('Tài khoản này đăng nhập bằng Google')
  }
  expect(await mailbox(page, google.email)).toEqual([])
})

test('AC69 AC145 P8 N3 an account not confirmed, and one that needs a password: "not confirmed"; only the button sends', async ({
  page,
  context,
}) => {
  const a = fresh('ac69')
  await signUp(page, a)
  await forgot(page, a.phone)
  await expect(notice(page)).toContainText(NOT_CONFIRMED)
  await expect(page.getByRole('button', { name: /Gửi lại link xác nhận|Gửi lại sau \d+ giây/ })).toBeVisible()
  expect((await mailbox(page, a.email)).map((m) => m.kind)).toEqual(['signup'])

  const b = fresh('ac145')
  await signUp(page, b)
  await setClock(context, 61)
  await googleAs(context, { email: b.email, outcome: 'dropped' })
  await page.goto('/sign-in')
  await tapGoogle(page)
  await forgot(page, b.phone)
  await expect(notice(page)).toContainText(NOT_CONFIRMED)
  expect((await mailbox(page, b.email)).map((m) => m.kind)).toEqual(['signup'])
  await page.getByRole('button', { name: 'Gửi lại link xác nhận' }).click()
  await expect(page.getByRole('button', { name: /Gửi lại sau \d+ giây/ })).toBeVisible()
  await expect.poll(async () => (await mailbox(page, b.email))[0].kind).toBe('recovery')
})

test('AC94 AC146 AC154 W3 N4 N12 the account that needed a password: confirmed by saving; then Google gets the AC49 sentence', async ({
  page,
  context,
}) => {
  const a = fresh('ac94')
  await signUp(page, a)
  await setClock(context, 61)
  await googleAs(context, { email: a.email, outcome: 'dropped' })
  await page.goto('/sign-in')
  await tapGoogle(page)
  await signIn(page, a.phone, 'abc12345')
  await page.getByRole('button', { name: 'Gửi lại link xác nhận' }).click()
  await expect(page.getByRole('button', { name: /Gửi lại sau \d+ giây/ })).toBeVisible()
  const link = await resetLink(page, a.email)
  // Opened, then left: still "not confirmed", whatever the password.
  await page.goto(link)
  await expect(resetHeading(page)).toBeVisible()
  await signIn(page, a.phone, 'abc12345')
  await expect(notice(page)).toContainText(NOT_CONFIRMED)
  const before = await profile(page, a.email)
  await page.goto(link)
  await save(page, NEW_PASSWORD)
  await expect(page).toHaveURL(home)
  // The profile is unchanged, except that it no longer needs a password (AC94).
  expect(await profile(page, a.email)).toEqual({ ...before, needsPassword: false })
  await signOut(page)
  await signIn(page, a.phone, NEW_PASSWORD)
  await expect(page).toHaveURL(home)
  await signOut(page)
  // B66: Google with that email now gets the AC49 sentence, and the account still signs in.
  await googleAs(context, { email: a.email })
  await page.goto('/sign-in')
  await tapGoogle(page)
  await expect(googleNotice(page).locator('p')).toHaveText(
    'Email này đã có tài khoản đăng nhập bằng số điện thoại; hãy đăng nhập bằng số điện thoại và mật khẩu',
  )
  expect(await session(page)).not.toHaveProperty('email')
  await signIn(page, a.phone, NEW_PASSWORD)
  await expect(page).toHaveURL(home)
})

test('AC147 N5 /auth/reset without a link opens the expired page, signed in or not', async ({ page, browser }) => {
  expect((await page.request.get('/test/sign-in?account=customer')).status()).toBe(200)
  await page.goto('/auth/reset')
  await expect(page).toHaveURL(EXPIRED)
  await expect(expiredHeading(page)).toBeVisible()
  const [other, out] = await newPage(browser)
  await out.goto('/auth/reset')
  await expect(out).toHaveURL(EXPIRED)
  await other.close()
})

test('AC148 N6 the expired reset page answers an account not confirmed as "Forgot password" does', async ({ page }) => {
  const a = fresh('ac148')
  await signUp(page, a)
  await forgot(page, a.phone, '/auth/expired?type=recovery')
  await expect(notice(page)).toContainText(NOT_CONFIRMED)
  expect((await mailbox(page, a.email)).map((m) => m.kind)).toEqual(['signup'])
})

test('AC84 AC153 A7 Q8 N11 an expired or saved link opens the expired page at once; a replaced one when saving', async ({
  page,
  context,
}) => {
  const a = fresh('ac153')
  await confirmedAccount(page, a)
  await signOut(page)
  await setClock(context, 61)
  await forgot(page, a.phone)
  const l1 = await resetLink(page, a.email)
  // More than 1 hour later: expired at once, no form.
  await setClock(context, 61 + 3601)
  await page.goto(l1)
  await expect(page).toHaveURL(EXPIRED)
  // A new link from that page (AC84), with the 60-second wait, saved, then tapped again.
  await page.locator('#field-identifier:visible').fill(a.phone)
  await submit(page)
  await expect(sentHeading(page)).toBeVisible()
  await expect(page.getByRole('button', { name: /Gửi lại sau \d+ giây/ })).toBeDisabled()
  const l2 = await resetLink(page, a.email)
  expect(l2).not.toBe(l1)
  await page.goto(l2)
  await save(page, NEW_PASSWORD)
  await expect(page).toHaveURL(home)
  await signOut(page)
  await page.goto(l2)
  await expect(page).toHaveURL(EXPIRED)
  // L3 replaced by L4: L3 shows the form, and saving opens the expired page; L4 still works.
  await setClock(context, 61 + 3601 + 61)
  await forgot(page, a.phone)
  const l3 = await resetLink(page, a.email)
  await setClock(context, 61 + 3601 + 122)
  await forgot(page, a.phone)
  const l4 = await resetLink(page, a.email)
  await page.goto(l3)
  await expect(resetHeading(page)).toBeVisible()
  await save(page, 'another2026')
  await expect(page).toHaveURL(EXPIRED)
  await page.goto(l4)
  await expect(resetHeading(page)).toBeVisible()
})

test('AC153 N11 a link held after the old password was refused, then replaced by a newer one: it saves nothing', async ({
  page,
  context,
}) => {
  // Its own account: the test sign-in mode sends at most 3 emails an hour to one address (B60).
  const a = fresh('n11held')
  await confirmedAccount(page, a)
  await signOut(page)
  await setClock(context, 61)
  await forgot(page, a.phone)
  const l1 = await resetLink(page, a.email)
  await page.goto(l1)
  await save(page, PASSWORD)
  await expect(fieldError(page, 'password')).toHaveText(SAME)
  await setClock(context, 122)
  await forgot(page, a.phone)
  const l2 = await resetLink(page, a.email)
  expect(l2).not.toBe(l1)
  await page.goto(l1)
  await save(page, NEW_PASSWORD)
  await expect(page).toHaveURL(EXPIRED)
  await signIn(page, a.phone, PASSWORD)
  await expect(page).toHaveURL(home)
  await signOut(page)
  await page.goto(l2)
  await save(page, NEW_PASSWORD)
  await expect(page).toHaveURL(home)
})

test('AC159 AC160 N18 N19 the reset page checks the link when reloaded and before the password rule; signed-out top bar', async ({
  page,
  context,
  browser,
}) => {
  const a = fresh('ac159')
  await confirmedAccount(page, a)
  await signOut(page)
  await setClock(context, 61)
  await forgot(page, a.phone)
  const link = await resetLink(page, a.email)
  await page.goto(link)
  await expect(resetHeading(page)).toBeVisible()
  // Saved on the "phone"; the computer reloads its open page.
  const [phoneContext, phone] = await newPage(browser)
  await phone.goto(link)
  await save(phone, NEW_PASSWORD)
  await expect(phone).toHaveURL(home)
  await page.reload()
  await expect(page).toHaveURL(EXPIRED)
  await phoneContext.close()

  // Past its hour, "abc" typed: the expired page, no password message.
  await setClock(context, 122)
  await forgot(page, a.phone)
  const late = await resetLink(page, a.email)
  await page.goto(late)
  await setClock(context, 122 + 3601)
  await save(page, 'abc')
  await expect(page).toHaveURL(EXPIRED)

  // The shop signed in opens a customer's link: no account menu on that page.
  const b = fresh('ac160')
  const [bContext, bPage] = await newPage(browser)
  await confirmedAccount(bPage, b)
  await setClock(bContext, 61)
  await forgot(bPage, b.phone)
  const bLink = await resetLink(bPage, b.email)
  await bContext.close()
  const [shopContext, shop] = await newPage(browser)
  expect((await shop.request.get('/test/sign-in?account=shop')).status()).toBe(200)
  await shop.goto(bLink)
  await expect(resetHeading(shop)).toBeVisible()
  await expect(shop.locator('summary:visible', { hasText: 'Tài khoản' })).toHaveCount(0)
  await shopContext.close()
})

test('AC161 AC162 N20 N21 a replaced link opens the expired page before the rule; the switch on the reset page changes only the browser', async ({
  page,
  context,
  browser,
}) => {
  const a = fresh('ac161')
  await confirmedAccount(page, a)
  await signOut(page)
  await setClock(context, 61)
  await forgot(page, a.phone)
  const l3 = await resetLink(page, a.email)
  await setClock(context, 122)
  await forgot(page, a.phone)
  await page.goto(l3)
  await save(page, 'abc')
  await expect(page).toHaveURL(EXPIRED)

  // The shop, saved in Vietnamese, opens the customer's newest link and switches to English.
  const l4 = await resetLink(page, a.email)
  const [shopContext, shop] = await newPage(browser)
  expect((await shop.request.get('/test/sign-in?account=shop')).status()).toBe(200)
  await shop.goto(l4)
  await shop.getByRole('button', { name: 'en', exact: true }).click()
  await expect(shop.getByRole('heading', { name: 'Set a new password' })).toBeVisible()
  expect(await profile(shop, TEST_ACCOUNTS.shop.email)).toMatchObject({ lang: 'vi' })
  await save(shop, NEW_PASSWORD)
  await expect(shop).toHaveURL(home)
  // The customer's language (Vietnamese) wins after saving.
  await expect(shop.locator('html')).toHaveAttribute('lang', 'vi')
  await shopContext.close()

  // An English customer's link opened by the Vietnamese shop, with no switch: English after saving.
  const [enContext, en] = await newPage(browser)
  await setLang(enContext, 'en')
  const b = fresh('ac162en')
  await confirmedAccount(en, b)
  await setClock(enContext, 61)
  await forgot(en, b.phone)
  const bLink = await resetLink(en, b.email)
  await enContext.close()
  const [shop2Context, shop2] = await newPage(browser)
  expect((await shop2.request.get('/test/sign-in?account=shop')).status()).toBe(200)
  await shop2.goto(bLink)
  await expect(shop2.locator('html')).toHaveAttribute('lang', 'vi')
  await save(shop2, NEW_PASSWORD)
  await expect(shop2).toHaveURL(home)
  await expect(shop2.locator('html')).toHaveAttribute('lang', 'en')
  await shop2Context.close()
})

test('X12 signed in, an expired reset link and "Send a new link" send a new reset link', async ({ page, context }) => {
  const a = fresh('x12')
  await confirmedAccount(page, a)
  await setClock(context, 61)
  await forgot(page, a.phone)
  const l1 = await resetLink(page, a.email)
  await setClock(context, 61 + 3601)
  await page.goto(l1)
  await expect(page).toHaveURL(EXPIRED)
  await page.locator('#field-identifier:visible').fill(a.email)
  await submit(page)
  await expect(sentHeading(page)).toBeVisible()
  expect(await resetLink(page, a.email)).not.toBe(l1)
})

test('AC100 AC150 AC158 X6 N8 N17 the old password refused; another device cannot use the link; saving signs out the others', async ({
  page,
  browser,
}) => {
  // The "phone": signed in with the account.
  const a = fresh('ac150')
  await confirmedAccount(page, a)
  // The "computer": signed in with the same account too.
  const [computerContext, computer] = await newPage(browser)
  await setClock(computerContext, 61)
  await signIn(computer, a.phone)
  await expect(computer).toHaveURL(home)
  await forgot(computer, a.phone)
  const link = await resetLink(computer, a.email)
  await computer.goto(link)
  await save(computer, PASSWORD)
  await expect(fieldError(computer, 'password')).toHaveText(SAME)
  expect(await session(page)).toMatchObject({ email: a.email })
  // Another device: the form, then "The link has expired" (AC158).
  const [thirdContext, third] = await newPage(browser)
  await third.goto(link)
  await expect(resetHeading(third)).toBeVisible()
  await save(third, NEW_PASSWORD)
  await expect(third).toHaveURL(EXPIRED)
  // The computer, after closing the page, opens the same link again and saves.
  await computer.goto('/')
  await computer.goto(link)
  await expect(resetHeading(computer)).toBeVisible()
  await save(computer, NEW_PASSWORD)
  await expect(computer).toHaveURL(home)
  expect(await session(computer)).toMatchObject({ email: a.email })
  expect(await session(page)).not.toHaveProperty('email')
  await computerContext.close()
  await thirdContext.close()
})

test('AC151 AC157 N9 N15 the shop saving a reset: lands on /shop; saving Huy reset ends the shop session of that browser', async ({
  page,
  context,
  browser,
}) => {
  // The second shop account, whose password only this test changes.
  const shop = TEST_ACCOUNTS.resetShop
  await forgot(page, shop.email)
  await page.goto(await resetLink(page, shop.email))
  await save(page, NEW_PASSWORD)
  await expect(page).toHaveURL(/\/shop$/)
  expect(await session(page)).toMatchObject({ email: shop.email, role: 'shop' })
  // A customer whose profile is complete lands on /.
  const customer = TEST_ACCOUNTS.resetCustomer
  const [cContext, cPage] = await newPage(browser)
  await forgot(cPage, customer.email)
  await cPage.goto(await resetLink(cPage, customer.email))
  await save(cPage, NEW_PASSWORD)
  await expect(cPage).toHaveURL(home)
  await expect(cPage.getByText(customer.name)).toBeVisible()
  await cContext.close()

  // The seeded shop signed in on two browsers; Huy's link saved on the first.
  const huy = fresh('ac157')
  const [huyContext, huyPage] = await newPage(browser)
  await confirmedAccount(huyPage, huy)
  await setClock(huyContext, 61)
  await forgot(huyPage, huy.phone)
  const link = await resetLink(huyPage, huy.email)
  const [phoneContext, phone] = await newPage(browser)
  expect((await page.request.get('/test/sign-in?account=shop')).status()).toBe(200)
  expect((await phone.request.get('/test/sign-in?account=shop')).status()).toBe(200)
  const shopToken = await sessionCookie(context)
  await page.goto(link)
  await save(page, NEW_PASSWORD)
  await expect(page).toHaveURL(home)
  expect(await session(page)).toMatchObject({ email: huy.email })
  expect(await session(phone)).toMatchObject({ email: TEST_ACCOUNTS.shop.email })
  // The shop's old session of this browser is ended for good: its token no longer signs in.
  const [oldContext, old] = await newPage(browser)
  await oldContext.addCookies([{ name: 'test_session', value: shopToken!, url: 'http://127.0.0.1:3100' }])
  expect(await session(old)).not.toHaveProperty('email')
  await oldContext.close()
  // The sent card, signed in: "Go to the home page" (Huy's last email went at 61 s).
  await setClock(context, 122)
  await forgot(page, huy.phone)
  await expect(sentHeading(page)).toBeVisible()
  await expect(page.getByRole('link', { name: 'Về trang chủ' })).toHaveAttribute('href', '/')
  await huyContext.close()
  await phoneContext.close()
  expect(TEST_PASSWORD).not.toBe(NEW_PASSWORD)
})

test('AC152 N10 "Forgot password?" carries no next, and after saving the customer lands on /', async ({ page, context }) => {
  const a = fresh('ac152')
  await confirmedAccount(page, a)
  await signOut(page)
  await setClock(context, 61)
  await page.goto('/sign-in?next=/proto')
  await page.getByRole('link', { name: 'Quên mật khẩu?' }).click()
  await expect(page).toHaveURL(/\/forgot-password$/)
  await page.getByRole('link', { name: 'Đăng nhập' }).last().click()
  await expect(page).toHaveURL(/\/sign-in$/)
  await page.getByRole('link', { name: 'Quên mật khẩu?' }).click()
  await expect(page).toHaveURL(/\/forgot-password$/)
  await page.locator('#field-identifier:visible').fill(a.phone)
  await submit(page)
  await page.goto(await resetLink(page, a.email))
  await save(page, NEW_PASSWORD)
  await expect(page).toHaveURL(home)
})

test('AC144 AC155 N2 N13 signed in, the form shows and sends; the link under the card goes home', async ({ page, context, browser }) => {
  const huy = fresh('ac144')
  const [huyContext, huyPage] = await newPage(browser)
  await confirmedAccount(huyPage, huy)
  await huyContext.close()
  const homeLink = (p: Page) => p.getByRole('link', { name: 'Về trang chủ' })

  // The shop: both pages link to /shop; it sends for Huy and stays signed in.
  await setClock(context, 61)
  expect((await page.request.get('/test/sign-in?account=shop')).status()).toBe(200)
  for (const path of ['/forgot-password', '/auth/expired?type=recovery']) {
    await page.goto(path)
    await homeLink(page).click()
    await expect(page).toHaveURL(/\/shop$/)
  }
  await forgot(page, huy.phone)
  await expect(sentHeading(page)).toBeVisible()
  expect((await mailbox(page, huy.email))[0].kind).toBe('recovery')
  expect(await session(page)).toMatchObject({ role: 'shop' })

  // A customer: both pages link to /; it sends for Huy too and stays signed in.
  await setClock(context, 122)
  expect((await page.request.get('/test/sign-in?account=customer')).status()).toBe(200)
  for (const path of ['/forgot-password', '/auth/expired?type=recovery']) {
    await page.goto(path)
    await homeLink(page).click()
    await expect(page).toHaveURL(home)
  }
  await forgot(page, huy.phone)
  await expect(sentHeading(page)).toBeVisible()
  expect((await mailbox(page, huy.email)).filter((m) => m.kind === 'recovery')).toHaveLength(2)
  expect(await session(page)).toMatchObject({ email: TEST_ACCOUNTS.customer.email })

  // Signed out: "Sign in" on both pages.
  const [outContext, out] = await newPage(browser)
  for (const path of ['/forgot-password', '/auth/expired?type=recovery']) {
    await out.goto(path)
    await out.getByRole('link', { name: 'Đăng nhập' }).last().click()
    await expect(out).toHaveURL(/\/sign-in$/)
  }
  await outContext.close()
})

test('AC156 N14 N16 an address the service refuses: the sentence where "Too many attempts" shows; nothing created', async ({
  page,
  context,
}) => {
  const refuse = async (email: string) =>
    expect((await page.request.get(`/test/mail-refuse?email=${encodeURIComponent(email)}`)).status()).toBe(200)
  // Sign-up: at the top of the card, no account.
  const x = fresh('ac156x')
  await refuse(x.email)
  await signUp(page, x)
  await expect(notice(page)).toHaveText(SEND_FAILED)
  expect(await mailbox(page, x.email)).toEqual([])
  await signIn(page, x.phone)
  await expect(notice(page)).toHaveText('Không có tài khoản nào với số điện thoại hoặc email này')

  // "Send the reset link": at the top of the card; "Send again" on the sent card: under the button.
  const a = fresh('ac156a')
  await confirmedAccount(page, a)
  await signOut(page)
  await setClock(context, 61)
  // The card counts the 60 seconds down in the browser: its clock is moved too.
  await page.clock.install()
  await forgot(page, a.phone)
  await expect(sentHeading(page)).toBeVisible()
  await refuse(a.email)
  await setClock(context, 122)
  // One second at a time: React sets the next timer of the countdown only after each render.
  for (let s = 0; s < 61; s++) await page.clock.runFor(1000)
  await page.getByRole('button', { name: 'Gửi lại', exact: true }).click()
  await expect(page.locator('main section p[role=alert]:visible')).toHaveText(SEND_FAILED)
  await forgot(page, a.phone)
  await expect(notice(page)).toHaveText(SEND_FAILED)

  // Under the Google button after AC91: in place of its sentence, the button kept.
  const w = fresh('ac156w')
  await signUp(page, w)
  await setClock(context, 200)
  await googleAs(context, { email: w.email })
  await page.goto('/sign-in')
  await tapGoogle(page)
  await refuse(w.email)
  await googleNotice(page).getByRole('button', { name: 'Gửi lại link xác nhận' }).click()
  await expect(googleNotice(page).locator('p')).toHaveText(SEND_FAILED)
  await expect(googleNotice(page).getByRole('button', { name: 'Gửi lại link xác nhận' })).toBeVisible()
})

test('AC113 Y2 a reset 20 seconds after a confirmation link to the same address waits until 60 seconds', async ({ page, context }) => {
  const a = fresh('ac113')
  await confirmedAccount(page, a)
  await signOut(page)
  await setClock(context, 20)
  await page.clock.install()
  await forgot(page, a.email)
  await expect(page.locator(SUBMIT)).toHaveText(/Gửi lại sau (3\d|40) giây/)
  await expect(page.locator(SUBMIT)).toBeDisabled()
  expect((await mailbox(page, a.email)).some((m) => m.kind === 'recovery')).toBe(false)
  // Disabled until 60 seconds after the first email, then it sends.
  for (let s = 0; s < 25; s++) await page.clock.runFor(1000)
  await expect(page.locator(SUBMIT)).toBeDisabled()
  for (let s = 0; s < 16; s++) await page.clock.runFor(1000)
  await expect(page.locator(SUBMIT)).toHaveText('Gửi link đặt lại mật khẩu')
  await expect(page.locator(SUBMIT)).toBeEnabled()
  await setClock(context, 61)
  await submit(page)
  await expect(sentHeading(page)).toBeVisible()
})

test('AC117 typing another address ends the wait of the main button, which belongs to one address', async ({ page, context }) => {
  const a = fresh('wait')
  await confirmedAccount(page, a)
  await signOut(page)
  await setClock(context, 20)
  await forgot(page, a.email)
  await expect(page.locator(SUBMIT)).toBeDisabled()
  await page.locator('#field-identifier:visible').fill('0987000111')
  await expect(page.locator(SUBMIT)).toHaveText('Gửi link đặt lại mật khẩu')
  await expect(page.locator(SUBMIT)).toBeEnabled()
})

for (const [lang, width] of [
  ['vi', 375],
  ['vi', 1280],
  ['en', 375],
  ['en', 1280],
] as const) {
  test(`E5 /auth/reset has no horizontal scroll in ${lang} at ${width} px`, async ({ page, context }) => {
    await page.setViewportSize({ width, height: 800 })
    const a = fresh(`e5r${lang}${width}`)
    await confirmedAccount(page, a)
    await signOut(page)
    await setClock(context, 61)
    await forgot(page, a.phone)
    await setLang(context, lang)
    await page.goto(await resetLink(page, a.email))
    await expect(page).toHaveURL(/\/auth\/reset$/)
    await expect(page.locator('html')).toHaveAttribute('lang', lang)
    await page.waitForLoadState('networkidle')
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
  })
}
