// A field's message disappears as soon as that field is edited, and the button checks again
// (CN-76, docs/test-scenarios.md section 24), on every account form, on the e2e server in the
// test sign-in mode. A test name starts with the AC ids it completes (X7, B56); no name gives
// CN-76, which AC166 (the profile, PR M1-5) still in the exception list cites.
import { expect, test, type Page } from '@playwright/test'
import { TEST_ACCOUNTS } from '@/server/auth/test-accounts'
import { SUBMIT, confirmedAccount, fieldError, fresh, mailbox, setClock, signOut, signUp } from './helpers'

const google = TEST_ACCOUNTS.google
const PHONE_INVALID = 'Số điện thoại không hợp lệ'
const RULE = 'Ít nhất 8 ký tự, có cả chữ và số'

const input = (page: Page, name: string) => page.locator(`#field-${name}:visible`)

/** Types `text` at the end of the field `name`, key by key, as a person corrects it. */
async function typeAtEnd(page: Page, name: string, text: string) {
  // "End" does not move the caret on macOS, so the caret is put after the last character here.
  await input(page, name).evaluate((el: HTMLInputElement) => {
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  })
  await input(page, name).pressSequentially(text)
}

async function submit(page: Page) {
  await Promise.all([page.waitForResponse((r) => r.request().method() === 'POST'), page.locator(SUBMIT).click()])
  await page.waitForLoadState('networkidle')
}

/**
 * Sends "0912 345" from the phone-or-email field of `path`, types "6" into it, taps again
 * (still not valid), then clears the field and taps again (a message of another kind).
 */
async function identifierClears(page: Page, path: string) {
  await page.goto(path)
  await input(page, 'identifier').fill('0912 345')
  await submit(page)
  await expect(fieldError(page, 'identifier')).toHaveText(PHONE_INVALID)
  await typeAtEnd(page, 'identifier', '6')
  await expect(fieldError(page, 'identifier')).toHaveCount(0)
  await expect(input(page, 'identifier')).not.toHaveAttribute('aria-invalid', 'true')
  // Still not a valid number: the next tap checks again and shows the message again.
  await submit(page)
  await expect(fieldError(page, 'identifier')).toHaveText(PHONE_INVALID)
  // The message of the new value: an empty field gets "Required".
  await input(page, 'identifier').fill('')
  await expect(fieldError(page, 'identifier')).toHaveCount(0)
  await submit(page)
  await expect(fieldError(page, 'identifier')).toHaveText('Bắt buộc')
}

test('AC163 C1 sign-up: the phone message disappears when the phone is edited; the others stay', async ({ page }) => {
  await page.goto('/sign-up')
  await input(page, 'phone').fill('0912 345')
  await input(page, 'email').fill('lan@')
  await submit(page)
  await expect(fieldError(page, 'phone')).toHaveText(PHONE_INVALID)
  await expect(fieldError(page, 'email')).toHaveText('Email không hợp lệ')
  await expect(fieldError(page, 'password')).toHaveText('Bắt buộc')

  await typeAtEnd(page, 'phone', '678')
  await expect(input(page, 'phone')).toHaveValue('0912 345678')
  await expect(fieldError(page, 'phone')).toHaveCount(0)
  await expect(fieldError(page, 'email')).toHaveText('Email không hợp lệ')
  await expect(fieldError(page, 'password')).toHaveText('Bắt buộc')

  await submit(page)
  await expect(fieldError(page, 'phone')).toHaveCount(0)
  await expect(fieldError(page, 'email')).toHaveText('Email không hợp lệ')
  await expect(fieldError(page, 'password')).toHaveText('Bắt buộc')
})

test('AC164 C2 sign-up: "Send again" under the phone goes with its message, and comes back with it', async ({ page }) => {
  const huy = fresh('ac164')
  await signUp(page, huy)
  await signUp(page, { phone: huy.phone, email: google.email })
  const waiting = 'Số điện thoại này đang chờ xác nhận email'
  const sendAgain = page.getByRole('button', { name: /^Gửi lại/ })
  await expect(fieldError(page, 'phone')).toHaveText(waiting)
  await expect(sendAgain).toBeVisible()

  await input(page, 'phone').fill(fresh('ac164b').phone)
  await expect(fieldError(page, 'phone')).toHaveCount(0)
  await expect(sendAgain).toHaveCount(0)
  // The email's message belongs to another field and stays.
  await expect(fieldError(page, 'email')).toHaveText('Email này đã có tài khoản (đăng nhập bằng Google)')

  await input(page, 'phone').fill(huy.phone)
  await submit(page)
  await expect(fieldError(page, 'phone')).toHaveText(waiting)
  await expect(sendAgain).toBeVisible()
})

test('AC167 C6 sign-up: every tap of "Sign up" starts "Send again" fresh, with the server\'s wait', async ({ page, context }) => {
  const huy = fresh('ac167')
  await signUp(page, huy) // email 1
  await setClock(context, 61)
  await signUp(page, { phone: huy.phone, email: google.email })
  const ready = page.getByRole('button', { name: 'Gửi lại', exact: true })
  const counting = page.getByRole('button', { name: /^Gửi lại sau \d+ giây$/ })
  const tooMany = page.getByText('Thử quá nhiều lần, vui lòng thử lại sau vài phút')

  await ready.click() // email 2
  await expect(counting).toBeDisabled()
  await submit(page)
  // The server's wait for that address, just after the send.
  await expect(counting).toHaveText(/^Gửi lại sau (59|60) giây$/)

  await setClock(context, 122)
  await submit(page)
  await ready.click() // email 3
  await expect(counting).toBeVisible()
  await setClock(context, 183)
  await submit(page)
  await ready.click() // over the limit
  await expect(tooMany).toBeVisible()

  // Without editing the phone: the server's wait is 0, as before the send; the button is fresh.
  await input(page, 'email').fill(fresh('ac167c').email)
  await input(page, 'email').fill(google.email)
  await submit(page)
  await expect(ready).toBeEnabled()
  await expect(tooMany).toHaveCount(0)

  // Editing the phone and back: the same.
  await ready.click()
  await expect(tooMany).toBeVisible()
  await input(page, 'phone').fill(fresh('ac167b').phone)
  await input(page, 'phone').fill(huy.phone)
  await submit(page)
  await expect(ready).toBeEnabled()
  await expect(tooMany).toHaveCount(0)
})

test('AC168 C7 every tap of "Send the reset link" starts the notice\'s button fresh', async ({ page, context }) => {
  const huy = fresh('ac168')
  await signUp(page, huy) // email 1
  await page.goto('/forgot-password')
  await input(page, 'identifier').fill(huy.phone)
  const button = page.getByRole('button', { name: 'Gửi lại link xác nhận' })
  const tooMany = page.getByText('Thử quá nhiều lần, vui lòng thử lại sau vài phút')
  for (const [i, seconds] of [61, 122, 183].entries()) {
    await setClock(context, seconds)
    await submit(page)
    await expect(button).toBeEnabled()
    await button.click() // emails 2 and 3, then over the limit
    if (i < 2) await expect(page.getByRole('button', { name: /^Gửi lại sau \d+ giây$/ })).toBeVisible()
  }
  await expect(tooMany).toBeVisible()
  // The server answers the same notice, with the same wait (0), as before the last send.
  await submit(page)
  await expect(page.locator('main section [role=alert]:visible').first()).toContainText('Bạn chưa xác nhận email')
  await expect(button).toBeEnabled()
  await expect(tooMany).toHaveCount(0)
})

test('AC169 C8 a field edited while the answer is on its way does not show the message of the value sent', async ({ page }) => {
  await page.goto('/sign-up')
  // Hold the answer back, so the phone can be edited while it is on its way.
  let release = () => {}
  const held = new Promise<void>((r) => (release = r))
  await page.route('**/sign-up', async (route) => {
    if (route.request().method() === 'POST') await held
    await route.continue()
  })
  await input(page, 'phone').fill('0912 345')
  const answer = page.waitForResponse((r) => r.request().method() === 'POST')
  await page.locator(SUBMIT).click()
  await typeAtEnd(page, 'phone', '678')
  release()
  await answer
  await expect(fieldError(page, 'email')).toHaveText('Bắt buộc')
  await expect(fieldError(page, 'password')).toHaveText('Bắt buộc')
  await expect(fieldError(page, 'phone')).toHaveCount(0)
  await page.unroute('**/sign-up')
  await submit(page)
  await expect(fieldError(page, 'email')).toHaveText('Bắt buộc')
  await expect(fieldError(page, 'phone')).toHaveCount(0)
})

test('AC170 C9 a field edited while the answer is on its way does not count down for the old address', async ({ page, context }) => {
  const a = fresh('ac170')
  await confirmedAccount(page, a)
  await signOut(page)
  await setClock(context, 61)
  await page.goto('/forgot-password')
  await input(page, 'identifier').fill(a.phone)
  await submit(page)
  await expect(page.getByRole('heading', { name: 'Đã gửi link đặt lại mật khẩu' })).toBeVisible()

  // Within the 60 seconds of that address: the answer is "wait", held back while the field is edited.
  await page.goto('/forgot-password')
  let release = () => {}
  const held = new Promise<void>((r) => (release = r))
  await page.route('**/forgot-password', async (route) => {
    if (route.request().method() === 'POST') await held
    await route.continue()
  })
  await input(page, 'identifier').fill(a.phone)
  const answer = page.waitForResponse((r) => r.request().method() === 'POST')
  await page.locator(SUBMIT).click()
  await input(page, 'identifier').fill(fresh('ac170b').phone)
  release()
  await answer
  await page.waitForLoadState('networkidle')
  await expect(page.getByRole('button', { name: 'Gửi link đặt lại mật khẩu' })).toBeEnabled()
  await expect(page.getByRole('button', { name: /^Gửi lại sau/ })).toHaveCount(0)
})

test('AC165 C3 sign-in: the identifier message disappears when it is edited; the password one stays', async ({ page }) => {
  await page.goto('/sign-in')
  await input(page, 'identifier').fill('0912 345')
  await submit(page)
  await expect(fieldError(page, 'identifier')).toHaveText(PHONE_INVALID)
  await expect(fieldError(page, 'password')).toHaveText('Bắt buộc')
  await typeAtEnd(page, 'identifier', '6')
  await expect(fieldError(page, 'identifier')).toHaveCount(0)
  await expect(fieldError(page, 'password')).toHaveText('Bắt buộc')
  await typeAtEnd(page, 'password', 'x')
  await expect(fieldError(page, 'password')).toHaveCount(0)
  await submit(page)
  await expect(fieldError(page, 'identifier')).toHaveText(PHONE_INVALID)
  // The message of the new value: an empty field gets "Required".
  await input(page, 'identifier').fill('')
  await expect(fieldError(page, 'identifier')).toHaveCount(0)
  await submit(page)
  await expect(fieldError(page, 'identifier')).toHaveText('Bắt buộc')
})

test('AC165 C3 "Forgot password" and both expired-link pages clear the message when the field is edited', async ({ page }) => {
  for (const path of ['/forgot-password', '/auth/expired?type=signup', '/auth/expired?type=recovery']) {
    await identifierClears(page, path)
  }
})

test('AC165 C4 "Set a new password": the rule message disappears when the field is edited', async ({ page, context }) => {
  const a = fresh('ac165')
  await confirmedAccount(page, a)
  await signOut(page)
  await setClock(context, 61)
  await page.goto('/forgot-password')
  await input(page, 'identifier').fill(a.email)
  await submit(page)
  const mail = (await mailbox(page, a.email)).find((m) => m.kind === 'recovery')
  expect(mail, `a reset link to ${a.email}`).toBeTruthy()
  await page.goto(mail!.link)

  await input(page, 'password').fill('abc')
  await submit(page)
  await expect(fieldError(page, 'password')).toHaveText(RULE)
  await typeAtEnd(page, 'password', 'd')
  await expect(fieldError(page, 'password')).toHaveCount(0)
  // "abcd" still breaks the rule: the next tap checks again and shows it again.
  await submit(page)
  await expect(fieldError(page, 'password')).toHaveText(RULE)
  // The message of the new value: an empty field gets "Required".
  await input(page, 'password').fill('')
  await expect(fieldError(page, 'password')).toHaveCount(0)
  await submit(page)
  await expect(fieldError(page, 'password')).toHaveText('Bắt buộc')
})
