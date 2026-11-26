// Helpers of the account tests (M1-2) on the e2e server in the test sign-in mode. Every test
// makes its own phone numbers and emails, so the tests can run in parallel on one database.
// Next 16 keeps pages visited before as hidden copies (React <Activity>), so the locators
// here match only what is visible.
import { expect, type BrowserContext, type Page } from '@playwright/test'
import { randomInt } from 'node:crypto'

/** A fresh, valid phone number (09 + 8 random digits) and email for one test. */
export function fresh(tag: string): { phone: string; email: string } {
  const n = String(randomInt(1e8)).padStart(8, '0')
  return { phone: `09${n}`, email: `${tag}-${n}@example.test` }
}

export const PASSWORD = 'lunch2026pw'

const BASE = 'http://127.0.0.1:3100'

/** Moves the clock of this browser context by `seconds` (B59). */
export async function setClock(context: BrowserContext, seconds: number) {
  await context.addCookies([{ name: 'test_clock_offset', value: String(seconds), url: BASE }])
}

export async function setLang(context: BrowserContext, lang: 'vi' | 'en') {
  await context.addCookies([{ name: 'lang', value: lang, url: BASE }])
}

/** `link` is the default Supabase template's link (?code=, CN-71); `tokenHashLink` the repository templates' one. */
export type Mail = { kind: string; link: string; tokenHashLink: string; sentAt: string }

export async function mailbox(page: Page, email: string): Promise<Mail[]> {
  const res = await page.request.get(`/test/mailbox?email=${encodeURIComponent(email)}`)
  expect(res.status()).toBe(200)
  return res.json()
}

/** The submit button of the card's own form, not the "Continue with Google" one (M1-3). */
export const SUBMIT = 'form:not([data-google]) button[type=submit]:visible'

const submit = (page: Page) => page.locator(SUBMIT)

/**
 * What the test sign-in mode's stand-in for Google answers (plan.md section 4): the Google
 * email and name, what the sign-in service does with an email already a user's, or a cancel.
 */
export async function googleAs(
  context: BrowserContext,
  ask: { email?: string; name?: string | null; outcome?: 'linked' | 'dropped' | 'new'; error?: boolean },
) {
  await context.addCookies([{ name: 'test_google', value: encodeURIComponent(JSON.stringify(ask)), url: BASE }])
}

/** Taps "Continue with Google" and waits until the browser has come back from the callback. */
export async function tapGoogle(page: Page) {
  await page.getByRole('button', { name: /Tiếp tục với Google|Continue with Google/ }).click()
  await page.waitForURL((u) => !u.pathname.startsWith('/test/google') && !u.pathname.startsWith('/auth/callback'))
  await page.waitForLoadState('networkidle')
}

/** The message under the Google button. */
export const googleNotice = (page: Page) => page.locator('#google-notice:visible')

/** Submits a form and waits until its Server Action (a POST) has answered. */
async function send(page: Page) {
  await Promise.all([page.waitForResponse((r) => r.request().method() === 'POST'), submit(page).click()])
  await page.waitForLoadState('networkidle')
}

/** Fills the sign-up form and submits it. */
export async function signUp(page: Page, a: { phone: string; email: string; password?: string }) {
  await page.goto('/sign-up')
  await page.locator('#field-phone:visible').fill(a.phone)
  await page.locator('#field-email:visible').fill(a.email)
  await page.locator('#field-password:visible').fill(a.password ?? PASSWORD)
  await send(page)
}

export async function signIn(page: Page, identifier: string, password = PASSWORD, path = '/sign-in') {
  await page.goto(path)
  await page.locator('#field-identifier:visible').fill(identifier)
  await page.locator('#field-password:visible').fill(password)
  await send(page)
}

/** Signs up and confirms through the latest link: a confirmed account, signed in. */
export async function confirmedAccount(page: Page, a: { phone: string; email: string }) {
  await signUp(page, a)
  await expect(page.getByRole('heading', { name: /Kiểm tra email|Check your email/ })).toBeVisible()
  const [mail] = await mailbox(page, a.email)
  await page.goto(mail.link)
  await expect(page).toHaveURL(/\/$/)
}

export async function signOut(page: Page) {
  await page.locator('summary:visible', { hasText: /Tài khoản|Account/ }).click()
  await page.getByRole('button', { name: /Đăng xuất|Sign out/ }).click()
  await expect(page).toHaveURL(/\/sign-in/)
}

/** The Notice about the whole action at the top of the card (Next has its own role="alert" outside main). */
export const notice = (page: Page) => page.locator('main section [role=alert]:visible').first()

/** The text under a field of the form. */
export const fieldError = (page: Page, name: string) => page.locator(`#field-${name}-error:visible`)
