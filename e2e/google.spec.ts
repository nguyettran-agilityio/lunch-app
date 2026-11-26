// Google sign-in, the linking guard and the shop role (PR M1-3, docs/test-scenarios.md
// sections 13, 17, 19, 21 and 22) on the e2e server in the test sign-in mode, whose stand-in
// for Google (/test/google) answers with what `googleAs` asked. A test name starts with the
// AC id it completes (X7, B56), never with CN-72 alone, which many criteria cite.
import { expect, test, type Page } from '@playwright/test'
import { TEST_ACCOUNTS, TEST_GOOGLE_SHOP_EMAIL, TEST_PASSWORD } from '@/server/auth/test-accounts'
import { confirmedAccount, fresh, googleAs, googleNotice, mailbox, notice, setClock, signIn, signOut, signUp, tapGoogle } from './helpers'

const shop = TEST_ACCOUNTS.shop
const google = TEST_ACCOUNTS.google
const lan = TEST_ACCOUNTS.lanWaitingChange

const TAKEN_PHONE = 'Email này đã có tài khoản đăng nhập bằng số điện thoại; hãy đăng nhập bằng số điện thoại và mật khẩu'
const NOT_CONFIRMED = 'Email này có tài khoản đăng nhập bằng số điện thoại và chưa được xác nhận'
const WAITING = 'Email này đang chờ xác nhận'
const FAILED = 'Chưa đăng nhập được bằng Google, vui lòng thử lại'

async function session(page: Page): Promise<{ email?: string; role?: string }> {
  // null when nobody is signed in.
  return ((await (await page.request.get('/test/session')).json()) as { email?: string; role?: string } | null) ?? {}
}

const home = /127\.0\.0\.1:\d+\/$/

test('AC49 A1 AC132 Z9 Google with the email of a confirmed phone account: refused on the tab where it was tapped', async ({
  page,
  context,
}) => {
  const a = fresh('ac49')
  await confirmedAccount(page, a)
  await signOut(page)
  await googleAs(context, { email: a.email, name: 'Lan' })

  await page.goto('/sign-in?next=/proto')
  await tapGoogle(page)
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fproto&google=googleTakenPhone$/)
  await expect(googleNotice(page)).toHaveText(TAKEN_PHONE)
  expect(await session(page)).not.toHaveProperty('email')

  await page.goto('/sign-up?next=/proto')
  await tapGoogle(page)
  await expect(page).toHaveURL(/\/sign-up\?next=%2Fproto&google=googleTakenPhone$/)
  await expect(googleNotice(page)).toHaveText(TAKEN_PHONE)
  expect(await session(page)).not.toHaveProperty('email')

  // Not joined: the account still signs in with phone + password.
  await signIn(page, a.phone)
  await expect(page).toHaveURL(home)
})

test('AC91 V6 Google with the email of a waiting phone account: refused, "Send the confirmation link again" sends the link', async ({
  page,
  context,
}) => {
  const a = fresh('ac91')
  await signUp(page, a)
  await setClock(context, 61)
  await googleAs(context, { email: a.email })
  await page.goto('/sign-in')
  await tapGoogle(page)
  await expect(page).toHaveURL(/\/sign-in\?google=googleNotConfirmed$/)
  await expect(googleNotice(page).locator('p')).toHaveText(NOT_CONFIRMED)
  await googleNotice(page).getByRole('button', { name: 'Gửi lại link xác nhận' }).click()
  await expect(googleNotice(page).getByRole('button')).toHaveText(/Gửi lại sau \d+ giây/)
  expect(await mailbox(page, a.email)).toHaveLength(2)

  // B63: the confirmation time Google set is cleared, so the password still waits for the link.
  await signIn(page, a.phone)
  await expect(notice(page)).toContainText('Bạn chưa xác nhận email')
  const [latest] = await mailbox(page, a.email)
  await page.goto(latest.link)
  await expect(page).toHaveURL(home)
})

test('AC134 Z11 the AC91 button more than 1 hour later: nothing sent, the message and the button replaced', async ({ page, context }) => {
  const a = fresh('ac134')
  await signUp(page, a)
  await setClock(context, 61)
  await googleAs(context, { email: a.email })
  await page.goto('/sign-in')
  await tapGoogle(page)
  await setClock(context, 61 + 3660)
  await googleNotice(page).getByRole('button', { name: 'Gửi lại link xác nhận' }).click()
  await expect(googleNotice(page)).toHaveText(FAILED)
  await expect(googleNotice(page).getByRole('button')).toHaveCount(0)
  expect(await mailbox(page, a.email)).toHaveLength(1)
})

test('AC136 Z13 the password removed at a Google sign-in: "not confirmed" for any password, the button sends the recovery link', async ({
  page,
  context,
}) => {
  const a = fresh('ac136')
  await signUp(page, a)
  await setClock(context, 61)
  await googleAs(context, { email: a.email, outcome: 'dropped' })
  await page.goto('/sign-in')
  await tapGoogle(page)
  await expect(googleNotice(page).locator('p')).toHaveText(NOT_CONFIRMED)
  for (const password of [undefined, 'abc12345']) {
    await signIn(page, a.phone, password)
    await expect(notice(page)).toContainText('Bạn chưa xác nhận email')
  }
  await page.getByRole('button', { name: 'Gửi lại link xác nhận' }).click()
  await expect(page.getByRole('button', { name: /Gửi lại sau \d+ giây/ })).toBeVisible()
  const [latest] = await mailbox(page, a.email)
  expect(latest.kind).toBe('recovery')
})

test('AC137 Z14 the AC91 button after the account was confirmed in another browser: "already confirmed", nothing sent', async ({
  page,
  context,
  browser,
}) => {
  const a = fresh('ac137')
  await signUp(page, a)
  await setClock(context, 61)
  await googleAs(context, { email: a.email })
  await page.goto('/sign-in')
  await tapGoogle(page)
  const other = await browser.newContext()
  const [first] = await mailbox(page, a.email)
  await (await other.newPage()).goto(first.link)
  await other.close()
  await googleNotice(page).getByRole('button', { name: 'Gửi lại link xác nhận' }).click()
  // The sentence replaces the AC91 message and the button.
  await expect(googleNotice(page)).toHaveText('Email của bạn đã được xác nhận, vui lòng đăng nhập')
  await expect(googleNotice(page).getByRole('button')).toHaveCount(0)
  expect(await mailbox(page, a.email)).toHaveLength(1)
})

test('AC139 Z16 the AC91 button after the email became a Google account: "This account signs in with Google"', async ({
  page,
  context,
  browser,
}) => {
  const a = fresh('ac139')
  await signUp(page, a)
  await setClock(context, 61)
  await googleAs(context, { email: a.email })
  await page.goto('/sign-in')
  await tapGoogle(page)
  // Another browser: a sign-up with the same phone and another email deletes the waiting
  // account (CN-62), then a first Google sign-in makes lan's email a Google account.
  const other = await browser.newContext()
  const tab = await other.newPage()
  await signUp(tab, { phone: a.phone, email: fresh('ac139b').email })
  await googleAs(other, { email: a.email, name: 'Lan' })
  await tab.goto('/sign-in')
  await tapGoogle(tab)
  await expect(tab).toHaveURL(home)
  await other.close()
  await googleNotice(page).getByRole('button', { name: 'Gửi lại link xác nhận' }).click()
  await expect(googleNotice(page)).toHaveText('Tài khoản này đăng nhập bằng Google')
  await expect(googleNotice(page).getByRole('button')).toHaveCount(0)
  expect(await mailbox(page, a.email)).toHaveLength(1)
})

test('AC141 Z18 the AC91 button past the email limit: "Too many attempts" with the button, then the AC91 sentence and the countdown', async ({
  page,
  context,
}) => {
  const a = fresh('ac141')
  await signUp(page, a) // email 1 at 0 s
  await setClock(context, 61)
  await googleAs(context, { email: a.email })
  await page.goto('/sign-in')
  await tapGoogle(page)
  const button = googleNotice(page).getByRole('button')
  // Emails 2 and 3, 61 s apart (the 60-second wait, CN-67); a reload starts the page again
  // with no countdown left by the moved clock.
  for (const seconds of [61, 122]) {
    await setClock(context, seconds)
    await page.reload()
    await button.click()
    await expect(button).toHaveText(/Gửi lại sau \d+ giây/)
  }
  // The fourth email in the hour: refused by the test mode's limit (B60).
  await setClock(context, 183)
  await page.reload()
  await button.click()
  await expect(googleNotice(page).locator('p')).toHaveText('Thử quá nhiều lần, vui lòng thử lại sau vài phút')
  await expect(button).toHaveText('Gửi lại link xác nhận')
  // Past the limit's hour (the first email drops out), still within the hour of the refusal.
  await setClock(context, 3605)
  await button.click()
  await expect(googleNotice(page).locator('p')).toHaveText(NOT_CONFIRMED)
  await expect(button).toHaveText(/Gửi lại sau \d+ giây/)
  expect(await mailbox(page, a.email)).toHaveLength(4)
})

test('AC140 Z17 Google with the email of the email + password shop account: the AC49 sentence', async ({ page, context }) => {
  await googleAs(context, { email: shop.email })
  await page.goto('/sign-in')
  await tapGoogle(page)
  await expect(page).toHaveURL(/\/sign-in\?google=googleTakenPhone$/)
  await expect(googleNotice(page)).toHaveText(TAKEN_PHONE)
  expect(await session(page)).not.toHaveProperty('email')
})

test('AC138 Z15 the AC91 button after a new sign-up replaced the waiting account: the link goes to the account waiting now', async ({
  page,
  context,
  browser,
}) => {
  const a = fresh('ac138')
  await signUp(page, a)
  // 61 s on, by this browser's clock: the button shows no countdown when the page opens.
  await setClock(context, 61)
  await googleAs(context, { email: a.email })
  await page.goto('/sign-in')
  await tapGoogle(page)
  // Another browser signs up with another phone and the same email (CN-62).
  const other = await browser.newContext()
  const b = fresh('ac138b')
  await signUp(await other.newPage(), { phone: b.phone, email: a.email })
  await other.close()
  const before = (await mailbox(page, a.email)).length
  await googleNotice(page).getByRole('button', { name: 'Gửi lại link xác nhận' }).click()
  await expect(googleNotice(page).getByRole('button')).toHaveText(/Gửi lại sau \d+ giây/)
  expect(await mailbox(page, a.email)).toHaveLength(before + 1)
  const [latest] = await mailbox(page, a.email)
  await page.goto(latest.link)
  await expect(page).toHaveURL(home)
  // The account signed in is the new one.
  await signOut(page)
  await signIn(page, b.phone)
  await expect(page).toHaveURL(home)
})

test('X17 Z5 a first Google sign-in with an email waiting as a new email: no account, only the message (Google part)', async ({
  browser,
}) => {
  // Huy, then Lan herself, each in their own browser.
  for (const who of ['huy', 'lan']) {
    const context = await browser.newContext()
    const page = await context.newPage()
    await googleAs(context, { email: lan.pendingEmail, name: who })
    await page.goto('/sign-in')
    await tapGoogle(page)
    await expect(page, who).toHaveURL(/\/sign-in\?google=googleWaiting$/)
    await expect(googleNotice(page)).toHaveText(WAITING)
    await expect(googleNotice(page).getByRole('button')).toHaveCount(0)
    expect(await session(page)).not.toHaveProperty('email')
    await context.close()
  }
})

test('AC131 Z8 a first Google sign-in: signed in, `/` greets the Google name', async ({ page, context }) => {
  const { email } = fresh('ac131')
  await googleAs(context, { email, name: 'Minh Trần' })
  await page.goto('/sign-in')
  await tapGoogle(page)
  await expect(page).toHaveURL(home)
  await expect(page.getByRole('heading', { name: 'Xin chào, Minh Trần' })).toBeVisible()
  expect(await session(page)).toEqual({ email, role: 'customer' })
})

test('AC135 Z12 an empty or blank Google name greets by the email; a long one is trimmed and cut to 80', async ({ browser }) => {
  const long = 'Nguyễn'.repeat(15)
  const cases: [string | null, (email: string) => string][] = [
    [null, (email) => email],
    ['   ', (email) => email],
    [`  ${long}`, () => Array.from(long).slice(0, 80).join('')],
  ]
  for (const [name, greeting] of cases) {
    const context = await browser.newContext()
    const page = await context.newPage()
    const { email } = fresh('ac135')
    await googleAs(context, { email, name })
    await page.goto('/sign-in')
    await tapGoogle(page)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Xin chào, ${greeting(email)}`)
    await context.close()
  }
})

test('AC130 Z7 a Google sign-in cancelled on Google page: back on sign-in, keeping `next`, with the message', async ({ page, context }) => {
  await googleAs(context, { error: true })
  await page.goto('/sign-in?next=/proto')
  await tapGoogle(page)
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fproto&google=googleFailed$/)
  await expect(googleNotice(page)).toHaveText(FAILED)
  expect(await session(page)).not.toHaveProperty('email')
})

test('AC133 Z10 a cancel from the Sign up tab comes back to it; a callback with no code goes to sign-in', async ({ page, context }) => {
  await googleAs(context, { error: true })
  await page.goto('/sign-up?next=/proto')
  await tapGoogle(page)
  await expect(page).toHaveURL(/\/sign-up\?next=%2Fproto&google=googleFailed$/)
  await expect(googleNotice(page)).toHaveText(FAILED)
  await page.goto('/auth/callback')
  await expect(page).toHaveURL(/\/sign-in\?google=googleFailed$/)
  await expect(googleNotice(page)).toHaveText(FAILED)
})

test('A17 a shop email signing in with Google goes to the shop screens, no profile asked (shop part)', async ({ page, context }) => {
  await googleAs(context, { email: TEST_GOOGLE_SHOP_EMAIL, name: 'Bếp' })
  await page.goto('/sign-in?next=/proto')
  await tapGoogle(page)
  await expect(page).toHaveURL(/\/shop$/)
  expect(await session(page)).toEqual({ email: TEST_GOOGLE_SHOP_EMAIL, role: 'shop' })
})

test('AC124 Z1 a shop account always goes to /shop, also for a `next` open to everyone', async ({ page, browser }) => {
  await page.request.get('/test/sign-in?account=shop')
  for (const next of ['/proto', '/proto/shop', '/auth/expired?type=signup']) {
    await page.goto(`/sign-in?next=${encodeURIComponent(next)}`)
    await expect(page, next).toHaveURL(/\/shop$/)
    await expect(page.locator('#field-password:visible')).toHaveCount(0)
    await page.waitForLoadState('networkidle')
  }
  const signedOut = await browser.newContext()
  const tab = await signedOut.newPage()
  await signIn(tab, shop.email, TEST_PASSWORD, '/sign-in?next=/forgot-password')
  await expect(tab).toHaveURL(/\/shop$/)
  await signedOut.close()
})

test('AC120 Y10 a signed-in shop account does not see the form (shop case)', async ({ page }) => {
  await page.request.get('/test/sign-in?account=shop')
  await page.goto('/sign-in?next=/sign-up')
  await expect(page).toHaveURL(/\/shop$/)
  await expect(page.locator('#field-password:visible')).toHaveCount(0)
})

test('AC121 Y11 the shop account signing in with the form from /sign-in?next=/sign-up goes to /shop at once (shop case)', async ({
  page,
}) => {
  await signIn(page, shop.email, TEST_PASSWORD, '/sign-in?next=/sign-up')
  await expect(page).toHaveURL(/\/shop$/)
})

test('AC129 Z6 a shop account on a customer page of the real app is sent to /shop', async ({ page }) => {
  await page.request.get('/test/sign-in?account=shop')
  for (const path of ['/', '/profile']) {
    await page.goto(path)
    await expect(page, path).toHaveURL(/\/shop$/)
    await page.waitForLoadState('networkidle')
  }
  // The prototype stays open to everyone.
  await page.goto('/proto')
  await expect(page).toHaveURL(/\/proto$/)
})

test('AC125 Z2 "Go to the home page" of the expired-link page leads a shop account to /shop', async ({ page }) => {
  await page.request.get('/test/sign-in?account=shop')
  await page.goto('/auth/expired?type=signup')
  await page.getByRole('link', { name: 'Về trang chủ' }).click()
  await expect(page).toHaveURL(/\/shop$/)
})

test('AC126 Z3 a Google account email on the expired sign-up link page: "This account signs in with Google"', async ({ page }) => {
  await page.goto('/auth/expired?type=signup')
  await page.locator('#field-identifier:visible').fill(google.email)
  await page.getByRole('button', { name: 'Gửi link mới' }).click()
  await expect(notice(page)).toHaveText('Tài khoản này đăng nhập bằng Google')
  expect(await mailbox(page, google.email)).toEqual([])
})

test('AC127 Z4 signing in with the phone number of a Google account: "This account signs in with Google"', async ({ page }) => {
  await signIn(page, google.phone, 'anything123')
  await expect(notice(page)).toHaveText('Tài khoản này đăng nhập bằng Google')
  expect(await session(page)).not.toHaveProperty('email')
})
