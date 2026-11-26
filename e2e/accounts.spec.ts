// Sign-up and sign-in with phone or email (PR M1-2, docs/test-scenarios.md sections 13, 15–17,
// 19 and 21) on the e2e server in the test sign-in mode. A test name starts with the AC id it
// completes (X7, B56); a test that covers only the M1-2 part of an AC gives its scenario id only.
import { expect, test } from '@playwright/test'
import { TEST_ACCOUNTS, TEST_PASSWORD } from '@/server/auth/test-accounts'
import { PASSWORD, confirmedAccount, fieldError, fresh, mailbox, notice, setClock, setLang, signIn, signOut, signUp } from './helpers'

const customer = TEST_ACCOUNTS.customer
const google = TEST_ACCOUNTS.google

test('AC96 X2 the sign-up checks show each message under its field', async ({ page }) => {
  await page.goto('/sign-up')
  await page.locator('#field-phone:visible').fill('028 1234 567')
  await page.locator('#field-email:visible').fill('lan@')
  await page.locator('form button[type=submit]:visible').click()
  await expect(fieldError(page, 'phone')).toHaveText('Số điện thoại không hợp lệ')
  await expect(fieldError(page, 'email')).toHaveText('Email không hợp lệ')
  await expect(fieldError(page, 'password')).toHaveText('Bắt buộc')
  await expect(page.locator('#field-phone:visible')).toHaveAttribute('aria-invalid', 'true')
  await page.locator('#field-phone:visible').fill('0912 345')
  await page.locator('form button[type=submit]:visible').click()
  await expect(fieldError(page, 'phone')).toHaveText('Số điện thoại không hợp lệ')
  await page.locator('#field-phone:visible').fill(fresh('ac96').phone)
  await page.locator('form button[type=submit]:visible').click()
  await expect(fieldError(page, 'phone')).toHaveCount(0)
})

test('AC108 X15 the sign-in field reads a phone number or an email', async ({ page }) => {
  await page.goto('/sign-in')
  await page.locator('#field-identifier:visible').fill('0281234567')
  await page.locator('#field-password:visible').fill('x')
  await page.locator('form button[type=submit]:visible').click()
  await expect(fieldError(page, 'identifier')).toHaveText('Số điện thoại không hợp lệ')
  await page.locator('#field-identifier:visible').fill('lan@')
  await page.locator('form button[type=submit]:visible').click()
  await expect(fieldError(page, 'identifier')).toHaveText('Email không hợp lệ')
})

test('P15 A10 the sign-up form asks only phone, email and password, with the password rule (sign-up part)', async ({ page }) => {
  await page.goto('/sign-up')
  await expect(page.locator('form input:not([type=hidden])')).toHaveCount(3)
  const a = fresh('a10')
  for (const bad of ['abc12', 'abcdefgh']) {
    await signUp(page, { ...a, password: bad })
    await expect(fieldError(page, 'password')).toHaveText('Ít nhất 8 ký tự, có cả chữ và số')
  }
  await signUp(page, { ...a, password: 'abcdef12' })
  await expect(page.getByRole('heading', { name: 'Kiểm tra email để xác nhận' })).toBeVisible()
})

test('AC51 A5 A6 A7 P8 sign-in waits for the confirmation; "Send again" after 60 s; an old link has expired', async ({ page, context }) => {
  const a = fresh('ac51')
  await signUp(page, a)
  // "Send again" on the sent card is disabled during the 60 seconds.
  await expect(page.getByRole('button', { name: /Gửi lại sau \d+ giây/ })).toBeDisabled()

  await signIn(page, a.phone)
  await expect(notice(page).first()).toContainText('Bạn chưa xác nhận email')
  await expect(page.getByRole('button', { name: /Gửi lại sau \d+ giây/ })).toBeDisabled()
  const [first] = await mailbox(page, a.email)

  await setClock(context, 61)
  await signIn(page, a.email)
  await page.getByRole('button', { name: 'Gửi lại link xác nhận' }).click()
  await expect(page.getByRole('button', { name: /Gửi lại sau \d+ giây/ })).toBeDisabled()
  const mails = await mailbox(page, a.email)
  expect(mails).toHaveLength(2)

  // The first link stopped working when the new one was sent.
  await page.goto(first.link)
  await expect(page).toHaveURL(/\/auth\/expired\?type=signup/)
  await expect(page.getByRole('heading', { name: 'Link đã hết hạn' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Gửi link mới' })).toBeVisible()

  // A link older than 1 hour has expired too.
  await setClock(context, 61 + 3601)
  await page.goto(mails[0].link)
  await expect(page).toHaveURL(/\/auth\/expired\?type=signup/)
})

test('Y14 the link of the default Supabase template: ?code= works once; an error or a bad code opens the expired-link page', async ({
  page,
  browser,
}) => {
  const a = fresh('y14')
  await signUp(page, a)
  const [mail] = await mailbox(page, a.email)
  expect(mail.link).toMatch(/^\/auth\/confirm\?code=/)
  // What Supabase sends back for an expired or used link, and a code it does not know.
  for (const bad of [
    '/auth/confirm?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
    '/auth/confirm?code=nope',
    '/auth/confirm',
  ]) {
    await page.goto(bad)
    await expect(page).toHaveURL(/\/auth\/expired\?type=signup$/)
  }
  await page.goto(mail.link)
  await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/)
  // Used once: a second tap, in another browser, has expired.
  const other = await browser.newContext()
  const tab = await other.newPage()
  await tab.goto(mail.link)
  await expect(tab).toHaveURL(/\/auth\/expired\?type=signup$/)
  await other.close()
})

test('Y14 the link of the repository templates (token_hash) still signs in', async ({ page }) => {
  const a = fresh('y14b')
  await signUp(page, a)
  const [mail] = await mailbox(page, a.email)
  await page.goto(mail.tokenHashLink)
  await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/)
})

test('AC52 A8 A9 X3 the link signs in; sign in with +84 and with the email; the number cannot sign up again', async ({ page }) => {
  const a = fresh('ac52')
  await confirmedAccount(page, a)
  await expect(
    page.getByRole('heading', { name: `Xin chào, ${a.phone.slice(0, 4)} ${a.phone.slice(4, 7)} ${a.phone.slice(7)}` }),
  ).toBeVisible()
  await signOut(page)
  await signIn(page, `+84${a.phone.slice(1)}`)
  await expect(page).toHaveURL(/\/$/)
  await signOut(page)
  await signIn(page, a.email.toUpperCase())
  await expect(page).toHaveURL(/\/$/)
  await signOut(page)
  await signUp(page, { phone: a.phone, email: fresh('ac52b').email })
  await expect(fieldError(page, 'phone')).toHaveText('Số điện thoại này đã có tài khoản. Nếu là của bạn, hãy gọi cho shop')
})

test('AC67 P6 a repeated sign-up of a waiting account creates nothing and sends nothing', async ({ page, context }) => {
  const a = fresh('ac67')
  await signUp(page, a)
  await signUp(page, { ...a, phone: `${a.phone.slice(0, 4)} ${a.phone.slice(4, 7)} ${a.phone.slice(7)}` })
  await expect(page.getByRole('heading', { name: 'Kiểm tra email để xác nhận' })).toBeVisible()
  expect(await mailbox(page, a.email)).toHaveLength(1)
  // "Send again" sends to the waiting account's email once the wait is over.
  await setClock(context, 61)
  await signUp(page, a)
  await page.getByRole('button', { name: 'Gửi lại', exact: true }).click()
  await expect(page.getByRole('button', { name: /Gửi lại sau/ })).toBeDisabled()
  expect(await mailbox(page, a.email)).toHaveLength(2)
})

test('AC112 Y1 a sign-up in English saves the account as EN', async ({ page, context }) => {
  await setLang(context, 'en')
  const a = fresh('ac112')
  await confirmedAccount(page, a)
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  // The browser forgets its choice; the account still says EN, and signing in wins.
  await signOut(page)
  await setLang(context, 'vi')
  await signIn(page, a.phone)
  await expect(page.getByRole('heading', { name: /^Hello,/ })).toBeVisible()
})

test('AC118 Y8 a repeated sign-up in English writes EN on the waiting account', async ({ page, context }) => {
  const a = fresh('ac118')
  await signUp(page, a)
  await setLang(context, 'en')
  await signUp(page, a)
  await expect(page.getByRole('heading', { name: 'Check your email to confirm' })).toBeVisible()
  expect(await mailbox(page, a.email)).toHaveLength(1)
  await setLang(context, 'vi')
  const [mail] = await mailbox(page, a.email)
  await page.goto(mail.link)
  await expect(page.getByRole('heading', { name: /^Hello,/ })).toBeVisible()
})

test('AC71 P10 the account language wins over the browser at sign-in', async ({ page, context }) => {
  await setLang(context, 'en')
  await signIn(page, TEST_ACCOUNTS.viCustomer.email, TEST_PASSWORD)
  await expect(page.getByRole('heading', { name: /^Xin chào,/ })).toBeVisible()
  const lang = (await context.cookies()).find((c) => c.name === 'lang')
  expect(lang?.value).toBe('vi')
})

test('AC50 A2 A3 A4 a sign-up with the email of a Google account or the phone of another account', async ({ page }) => {
  await signUp(page, { phone: fresh('ac50').phone, email: google.email })
  await expect(fieldError(page, 'email')).toHaveText('Email này đã có tài khoản (đăng nhập bằng Google)')
  await signUp(page, { phone: fresh('ac50b').phone, email: customer.email })
  await expect(fieldError(page, 'email')).toHaveText('Email này đã có tài khoản (đăng nhập bằng số điện thoại)')
  await signUp(page, { phone: '0912 345 678', email: fresh('ac50c').email })
  await expect(fieldError(page, 'phone')).toHaveText('Số điện thoại này đã có tài khoản. Nếu là của bạn, hãy gọi cho shop')
})

test('AC114 Y3 the phone and the email of one confirmed account get both messages', async ({ page }) => {
  await signUp(page, { phone: customer.phone, email: customer.email })
  await expect(fieldError(page, 'phone')).toHaveText('Số điện thoại này đã có tài khoản. Nếu là của bạn, hãy gọi cho shop')
  await expect(fieldError(page, 'email')).toHaveText('Email này đã có tài khoản (đăng nhập bằng số điện thoại)')
})

test('AC115 Y4 a refused phone keeps the waiting account of the email', async ({ page }) => {
  const huy = fresh('ac115')
  await signUp(page, huy)
  await signUp(page, { phone: customer.phone, email: huy.email })
  await expect(fieldError(page, 'phone')).toHaveText('Số điện thoại này đã có tài khoản. Nếu là của bạn, hãy gọi cho shop')
  await expect(fieldError(page, 'email')).toHaveCount(0)
  const mails = await mailbox(page, huy.email)
  expect(mails).toHaveLength(1)
  await page.goto(mails[0].link)
  await expect(page).toHaveURL(/\/$/)
})

test('AC83 Q7 a waiting phone and a Google email each get their message', async ({ page, context }) => {
  const huy = fresh('ac83')
  await signUp(page, huy)
  await setClock(context, 61)
  await signUp(page, { phone: huy.phone, email: google.email })
  await expect(fieldError(page, 'phone')).toHaveText('Số điện thoại này đang chờ xác nhận email')
  await expect(fieldError(page, 'email')).toHaveText('Email này đã có tài khoản (đăng nhập bằng Google)')
  await page.getByRole('button', { name: 'Gửi lại', exact: true }).click()
  await expect(page.getByRole('button', { name: /Gửi lại sau/ })).toBeDisabled()
  expect(await mailbox(page, huy.email)).toHaveLength(2)
})

test('AC90 V5 a sign-up that matches a waiting account on one field replaces it', async ({ page }) => {
  // The same phone with another email.
  const lan = fresh('ac90')
  await signUp(page, lan)
  const [old] = await mailbox(page, lan.email)
  const other = fresh('ac90b').email
  await signUp(page, { phone: lan.phone, email: other })
  await expect(page.getByRole('heading', { name: 'Kiểm tra email để xác nhận' })).toBeVisible()
  await page.goto(old.link)
  await expect(page).toHaveURL(/\/auth\/expired/)
  const [fresh1] = await mailbox(page, other)
  await page.goto(fresh1.link)
  await expect(page).toHaveURL(/\/$/)
  await signOut(page)

  // The same email with another phone.
  const huy = fresh('ac90c')
  await signUp(page, huy)
  const [old2] = await mailbox(page, huy.email)
  await signUp(page, { phone: fresh('ac90d').phone, email: huy.email })
  await expect(page.getByRole('heading', { name: 'Kiểm tra email để xác nhận' })).toBeVisible()
  await page.goto(old2.link)
  await expect(page).toHaveURL(/\/auth\/expired/)
})

test('AC116 Y6 the replacing account gets its link at once, within the 60 seconds', async ({ page, context }) => {
  const lan = fresh('ac116')
  await signUp(page, lan)
  await setClock(context, 20)
  await signUp(page, { phone: fresh('ac116b').phone, email: lan.email })
  await expect(page.getByRole('heading', { name: 'Kiểm tra email để xác nhận' })).toBeVisible()
  expect(await mailbox(page, lan.email)).toHaveLength(2)
})

test('AC93 W2 a sign-up with the phone of one waiting account and the email of another replaces both', async ({ page }) => {
  const a = fresh('ac93a')
  const b = fresh('ac93b')
  await signUp(page, a)
  await signUp(page, b)
  const [linkA] = await mailbox(page, a.email)
  const [linkB] = await mailbox(page, b.email)
  await signUp(page, { phone: a.phone, email: b.email })
  await expect(page.getByRole('heading', { name: 'Kiểm tra email để xác nhận' })).toBeVisible()
  for (const old of [linkA, linkB]) {
    await page.goto(old.link)
    await expect(page).toHaveURL(/\/auth\/expired/)
  }
  const [newest] = await mailbox(page, b.email)
  await page.goto(newest.link)
  await expect(page).toHaveURL(/\/$/)
})

test('AC68 P7 sign-in says which case it is', async ({ page }) => {
  await signIn(page, customer.email, 'wrongpass1')
  await expect(notice(page)).toHaveText('Sai mật khẩu')
  await signIn(page, fresh('ac68').phone, 'whatever1')
  await expect(notice(page)).toHaveText('Không có tài khoản nào với số điện thoại hoặc email này')
  await signIn(page, google.email, 'whatever1')
  await expect(notice(page)).toHaveText('Tài khoản này đăng nhập bằng Google')
})

test('AC117 Y7 Q8 the other sending buttons wait with the seconds left, then send', async ({ page, context }) => {
  const a = fresh('ac117')
  await signUp(page, a)
  await setClock(context, 15)
  await signIn(page, a.phone)
  await expect(page.getByRole('button', { name: /Gửi lại sau (3\d|4[0-5]) giây/ })).toBeDisabled()

  await page.goto('/auth/expired?type=signup')
  await page.locator('#field-identifier:visible').fill(a.phone)
  await page.getByRole('button', { name: 'Gửi link mới' }).click()
  await expect(page.getByRole('button', { name: /Gửi lại sau (3\d|4[0-5]) giây/ })).toBeDisabled()
  expect(await mailbox(page, a.email)).toHaveLength(1)

  await setClock(context, 61)
  await page.goto('/auth/expired?type=signup')
  await page.locator('#field-identifier:visible').fill(a.phone)
  await page.getByRole('button', { name: 'Gửi link mới' }).click()
  await expect(page.getByRole('heading', { name: 'Kiểm tra email để xác nhận' })).toBeVisible()
  expect(await mailbox(page, a.email)).toHaveLength(2)
})

test('AC99 X5 the expired-link page for a confirmed account and for a replaced one', async ({ page }) => {
  await page.goto('/auth/expired?type=signup')
  await page.locator('#field-identifier:visible').fill(customer.phone)
  await page.getByRole('button', { name: 'Gửi link mới' }).click()
  await expect(notice(page)).toContainText('Email của bạn đã được xác nhận, vui lòng đăng nhập')

  const lan = fresh('ac99')
  await signUp(page, lan)
  await signUp(page, { phone: lan.phone, email: fresh('ac99b').email })
  await page.goto('/auth/expired?type=signup')
  await page.locator('#field-identifier:visible').fill(lan.email)
  await page.getByRole('button', { name: 'Gửi link mới' }).click()
  await expect(notice(page)).toHaveText('Không có tài khoản nào với số điện thoại hoặc email này')
})

test('AC122 Y12 the expired-link page for someone signed in has no "Sign in" link', async ({ page }) => {
  await page.request.get('/test/sign-in?account=customer')
  await page.goto('/auth/expired?type=signup')
  await page.locator('#field-identifier:visible').fill(customer.phone)
  await page.getByRole('button', { name: 'Gửi link mới' }).click()
  await expect(notice(page)).toHaveText('Email của bạn đã được xác nhận, vui lòng đăng nhập')
  await expect(page.locator('main').getByRole('link', { name: 'Đăng nhập' })).toHaveCount(0)
  await page.getByRole('link', { name: 'Về trang chủ' }).click()
  await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/)
})

test('AC98 X4 X11 past the limit of sign-ins or emails: "Too many attempts"', async ({ page, context }) => {
  const a = fresh('ac98')
  await confirmedAccount(page, a)
  await signOut(page)
  for (let i = 0; i < 5; i++) {
    await signIn(page, a.email, 'wrongpass1')
    await expect(notice(page)).toHaveText('Sai mật khẩu')
  }
  await signIn(page, a.email, PASSWORD)
  await expect(notice(page)).toHaveText('Thử quá nhiều lần, vui lòng thử lại sau vài phút')

  const b = fresh('ac98b')
  await signUp(page, b)
  for (let i = 1; i <= 3; i++) {
    await setClock(context, 61 * i)
    await page.goto('/auth/expired?type=signup')
    await page.locator('#field-identifier:visible').fill(b.phone)
    await page.getByRole('button', { name: 'Gửi link mới' }).click()
    if (i < 3) await expect(page.getByRole('heading', { name: 'Kiểm tra email để xác nhận' })).toBeVisible()
    else await expect(notice(page)).toHaveText('Thử quá nhiều lần, vui lòng thử lại sau vài phút')
  }
})

test('AC102 X8 the session stays after reopening the browser until "Sign out"', async ({ browser, page, context }) => {
  await signIn(page, TEST_ACCOUNTS.viCustomer.phone, TEST_PASSWORD)
  await expect(page).toHaveURL(/\/$/)
  // A browser keeps only cookies with an expiry when it closes, so the session cookie has one.
  const session = (await context.cookies()).find((c) => c.name === 'test_session')
  expect(session?.expires ?? -1).toBeGreaterThan(Date.now() / 1000 + 300 * 24 * 60 * 60)
  const state = await context.storageState()
  await context.close()
  const reopened = await browser.newContext({ storageState: state })
  const again = await reopened.newPage()
  await again.goto('/')
  await expect(again.getByRole('heading', { name: /^Xin chào,/ })).toBeVisible()
  await signOut(again)
  await again.goto('/')
  await expect(again).toHaveURL(/\/sign-in/)
  await reopened.close()
})

test('AC119 Y9 a customer who opens /shop is sent to /', async ({ page }) => {
  await page.request.get('/test/sign-in?account=customer')
  await page.goto('/shop')
  await expect(page).toHaveURL(/\/$/)
})

test('X14 a shop account goes to /shop after signing in (shop part)', async ({ page }) => {
  // The shop account opens /profile signed out (AC107): proxy.ts sends it to sign in first.
  await page.goto('/profile')
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fprofile$/)
  await page.locator('#field-identifier:visible').fill(TEST_ACCOUNTS.shop.email)
  await page.locator('#field-password:visible').fill(TEST_PASSWORD)
  await page.locator('form button[type=submit]:visible').click()
  await expect(page).toHaveURL(/\/shop$/)
  await expect(page.getByRole('heading', { name: 'Xin chào shop' })).toBeVisible()
})

test('AC120 Y10 someone signed in does not see the sign-in or sign-up form', async ({ page }) => {
  await page.request.get('/test/sign-in?account=customer')
  const cases: [string, RegExp][] = [
    ['/sign-in', /\/$/],
    ['/sign-up', /\/$/],
    ['/sign-in?next=/proto', /\/proto$/],
    ['/sign-up?next=/proto', /\/proto$/],
    ['/sign-in?next=/sign-up', /\/$/],
  ]
  for (const [url, to] of cases) {
    await page.goto(url)
    await expect(page).toHaveURL(to)
    await expect(page.locator('#field-password:visible')).toHaveCount(0)
    await page.waitForLoadState('networkidle')
  }
})

test('AC121 Y11 where `next` leads, signed in and after signing in with the form', async ({ page, browser }) => {
  await page.request.get('/test/sign-in?account=customer')
  const cases: [string, RegExp][] = [
    ['/sign-in?next=/shop', /127\.0\.0\.1:\d+\/$/],
    [`/sign-in?next=${encodeURIComponent('/sign-up?next=/proto')}`, /127\.0\.0\.1:\d+\/$/],
    [`/sign-in?next=${encodeURIComponent('/auth/expired?type=signup')}`, /\/auth\/expired\?type=signup$/],
    ['/sign-in?next=/proto/shop', /\/proto\/shop$/],
  ]
  for (const [url, to] of cases) {
    await page.goto(url)
    await expect(page).toHaveURL(to)
    await page.waitForLoadState('networkidle')
  }

  // Signed out: a fresh browser context, so no redirect of the signed-in part is still running.
  const signedOut = await browser.newContext()
  const tab = await signedOut.newPage()
  await tab.goto('/sign-in?next=/sign-up')
  await tab.getByRole('link', { name: 'Đăng ký' }).click()
  await expect(tab).toHaveURL(/\/sign-up\?next=%2Fsign-up$/)
  await tab.getByRole('link', { name: 'Đăng nhập' }).click()
  await expect(tab).toHaveURL(/\/sign-in\?next=%2Fsign-up$/)
  await tab.locator('#field-identifier:visible').fill(customer.email)
  await tab.locator('#field-password:visible').fill(TEST_PASSWORD)
  await tab.locator('form button[type=submit]:visible').click()
  await expect(tab).toHaveURL(/127\.0\.0\.1:\d+\/$/)
  await signedOut.close()
})

test('X1 a visitor not signed in goes to sign-in, switches to English, and comes back (M1-2 part)', async ({ page, browser }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/sign-in$/)
  await page.goto('/shop')
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fshop$/)
  await page.goto('/sign-in?next=/proto/cart')
  await page.getByRole('button', { name: 'en', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Sign in to order lunch' })).toBeVisible()
  await page.locator('#field-identifier:visible').fill(customer.email)
  await page.locator('#field-password:visible').fill(TEST_PASSWORD)
  await page.locator('form button[type=submit]:visible').click()
  await expect(page).toHaveURL(/\/proto\/cart$/)
  const other = await browser.newContext()
  const tab = await other.newPage()
  await tab.goto('/proto')
  await expect(tab).toHaveURL(/\/proto$/)
  await other.close()
})
