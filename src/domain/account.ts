// Pure rules of the account forms (BR-29a, CN-64, CN-65, CN-69): the checks that run before
// any lookup, and where the app goes after signing in. No I/O.
import { isValidPassword } from './password'
import { isValidPhone, normalizePhone } from './phone'

/** A message under one field. The texts are in i18n.ts (`auth.field`). */
export type FieldError =
  | 'required'
  | 'phoneInvalid'
  | 'emailInvalid'
  | 'passwordRule'
  | 'phoneTaken'
  | 'phoneWaiting'
  | 'emailTakenGoogle'
  | 'emailTakenPhone'
  | 'emailWaiting'
  // A new password equal to the old one, on the reset page (CN-73).
  | 'samePassword'
  // The profile (BR-29a, CN-60, CN-64, CN-78): a name over 80 characters, an email of another
  // account, an email of the shop list, and the service's limit on a new email.
  | 'nameTooLong'
  | 'emailTaken'
  | 'emailShop'
  | 'tooMany'

/**
 * A message about the whole action, shown as a Notice at the top of the card (UI17); for a
 * "Send again" button, right under it. `sendFailed`: the service could not send the email for
 * a reason other than its limit (CN-74).
 */
export type NoticeCode =
  | 'wrongPassword'
  | 'noAccount'
  | 'googleAccount'
  | 'notConfirmed'
  | 'tooMany'
  | 'sendFailed'
  | 'alreadyConfirmed'
  // The expired page of an email-change link when no new email waits (CN-77, CN-78).
  | 'noPendingEmail'
  | GoogleRefusal

/**
 * Why a Google sign-in came back without signing in (BR-29a, CN-62, CN-65, CN-72), shown
 * under the Google button of the tab where Google was tapped: the email of a phone + password
 * account (AC49), of one not confirmed yet (AC91), an email waiting as a new email (AC110,
 * AC128), or a cancel or failure (AC130, AC133, AC134).
 */
export type GoogleRefusal = 'googleTakenPhone' | 'googleNotConfirmed' | 'googleWaiting' | 'googleFailed'

export const GOOGLE_REFUSALS: readonly GoogleRefusal[] = ['googleTakenPhone', 'googleNotConfirmed', 'googleWaiting', 'googleFailed']

export function isGoogleRefusal(v: unknown): v is GoogleRefusal {
  return typeof v === 'string' && (GOOGLE_REFUSALS as readonly string[]).includes(v)
}

/**
 * Where a Google sign-in that did not sign in comes back (CN-72): the tab where Google was
 * tapped, `next` kept, and the code of its message; no email in the URL.
 */
export function googleRefusalPath(start: { tab: 'signIn' | 'signUp'; next: string | null } | null, code: GoogleRefusal): string {
  const params = new URLSearchParams()
  if (start?.next) params.set('next', start.next)
  params.set('google', code)
  return `${start?.tab === 'signUp' ? '/sign-up' : '/sign-in'}?${params}`
}

/** The longest name, counted in characters after Unicode NFC normalization (BR-29a, CN-64). */
export const NAME_MAX = 80

/**
 * The name stored from Google at the first Google sign-in (CN-72, AC131, AC135): the spaces at
 * its start and end removed first; empty means no name; then cut to 80 characters.
 */
export function googleName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const name = raw.normalize('NFC').trim()
  if (!name) return null
  return Array.from(name).slice(0, NAME_MAX).join('')
}

/**
 * The name of the profile (BR-29a, CN-64, AC103): required, the spaces at its start and end
 * removed, at most 80 characters counted after NFC normalization.
 */
export function checkName(raw: string): { name: string } | { error: FieldError } {
  const name = raw.normalize('NFC').trim()
  if (!name) return { error: 'required' }
  if (Array.from(name).length > NAME_MAX) return { error: 'nameTooLong' }
  return { name }
}

/** The phone number of the profile, checked as at sign-up (BR-29a, CN-64). */
export function checkPhone(raw: string): { phone: string } | { error: FieldError } {
  if (!raw.trim()) return { error: 'required' }
  const phone = normalizePhone(raw)
  return isValidPhone(phone) ? { phone } : { error: 'phoneInvalid' }
}

/** The email of the profile: required and an email address (CN-64). */
export function checkEmail(raw: string): { email: string } | { error: FieldError } {
  const email = normalizeEmail(raw)
  if (!email) return { error: 'required' }
  return isValidEmail(email) ? { email } : { error: 'emailInvalid' }
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function normalizeEmail(input: string): string {
  return input.trim().toLowerCase()
}

/** An email "x@y.z" (CN-64). */
export function isValidEmail(email: string): boolean {
  return EMAIL.test(email)
}

/** A field that takes a phone number or an email: an email when it contains "@" (CN-65). */
export type Identifier = { kind: 'email'; email: string } | { kind: 'phone'; phone: string }

export function readIdentifier(input: string): Identifier | FieldError {
  const value = input.trim()
  if (!value) return 'required'
  if (value.includes('@')) {
    const email = normalizeEmail(value)
    return isValidEmail(email) ? { kind: 'email', email } : 'emailInvalid'
  }
  const phone = normalizePhone(value)
  return isValidPhone(phone) ? { kind: 'phone', phone } : 'phoneInvalid'
}

export type SignUpInput = { phone: string; email: string; password: string }
export type SignUpValues = { phone: string; email: string; password: string }
export type FieldErrors<K extends string> = Partial<Record<K, FieldError>>

/** The sign-up checks of CN-64, each under its own field; null when every field passes. */
export function checkSignUp(input: SignUpInput): { values: SignUpValues } | { errors: FieldErrors<keyof SignUpInput> } {
  const errors: FieldErrors<keyof SignUpInput> = {}
  const phone = normalizePhone(input.phone)
  if (!input.phone.trim()) errors.phone = 'required'
  else if (!isValidPhone(phone)) errors.phone = 'phoneInvalid'
  const email = normalizeEmail(input.email)
  if (!email) errors.email = 'required'
  else if (!isValidEmail(email)) errors.email = 'emailInvalid'
  if (!input.password) errors.password = 'required'
  else if (!isValidPassword(input.password)) errors.password = 'passwordRule'
  return Object.keys(errors).length ? { errors } : { values: { phone, email, password: input.password } }
}

export type SignInInput = { identifier: string; password: string }

export function checkSignIn(input: SignInInput): { identifier: Identifier; password: string } | { errors: FieldErrors<keyof SignInInput> } {
  const errors: FieldErrors<keyof SignInInput> = {}
  const identifier = readIdentifier(input.identifier)
  if (typeof identifier === 'string') errors.identifier = identifier
  if (!input.password) errors.password = 'required'
  return typeof identifier === 'string' || errors.password ? { errors } : { identifier, password: input.password }
}

/**
 * The `next` of a sign-in link, or null when it does not count as a page to return to (CN-65,
 * CN-69): it must be a path of this app; a path of /sign-in or /sign-up counts as none, whatever
 * follows it; for a customer a page of the real /shop counts as none too (not /proto/shop).
 */
export function returnPath(next: string | null | undefined, role: 'customer' | 'shop'): string | null {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return null
  let url: URL
  try {
    url = new URL(next, 'http://app.invalid')
  } catch {
    return null
  }
  if (url.origin !== 'http://app.invalid') return null
  const path = url.pathname
  const under = (p: string) => path === p || path.startsWith(`${p}/`)
  if (under('/sign-in') || under('/sign-up')) return null
  if (role === 'customer' && under('/shop')) return null
  return `${path}${url.search}`
}

/** The shop pages the app has (CN-80): a shop `next` to one of them is followed, with its query. */
export const SHOP_PAGES = ['/shop', '/shop/dishes', '/shop/rules'] as const

/** Whether `path` (no query) is a shop page the app has (CN-80, AC201). */
export const isShopPage = (path: string): boolean => (SHOP_PAGES as readonly string[]).includes(path)

/**
 * Where the app goes after signing in, and for someone already signed in who opens /sign-in or
 * /sign-up (CN-65, CN-69): a shop account to the shop page of `next` when the app has that page,
 * its query kept, else to /shop, also for a page open to everyone (CN-72, CN-80); a customer
 * whose profile is incomplete to the profile first, carrying the page to return to once it is
 * saved (CN-65, plan.md section 1.5); else `next`, or /.
 */
export function afterSignIn({ role, complete, next }: { role: 'customer' | 'shop'; complete: boolean; next?: string | null }): string {
  if (role === 'shop') {
    const back = returnPath(next, role)
    return back && isShopPage(back.split('?')[0]) ? back : '/shop'
  }
  const back = returnPath(next, role)
  if (!complete) return back && back !== '/' && !back.startsWith('/profile') ? `/profile?next=${encodeURIComponent(back)}` : '/profile'
  return back ?? '/'
}

/** The pages open to everyone (B55, CN-64): the prototype, the account pages and the test routes. */
const OPEN = ['/proto', '/sign-in', '/sign-up', '/forgot-password', '/auth', '/test']

const isUnder = (path: string, p: string) => path === p || path.startsWith(`${p}/`)

export function isOpenPath(path: string): boolean {
  return OPEN.some((p) => isUnder(path, p))
}

/**
 * Where a signed-in account that opens `path` is sent, or null to show the page (CN-68,
 * CN-72): a customer on a shop page of the real app to /; a shop account on a customer page
 * of the real app (any page not open to everyone and not under /shop) to /shop.
 */
export function roleRedirect(path: string, role: 'customer' | 'shop'): string | null {
  if (isOpenPath(path)) return null
  const shopPage = isUnder(path, '/shop')
  if (role === 'customer' && shopPage) return '/'
  if (role === 'shop' && !shopPage) return '/shop'
  return null
}

/** A complete profile: name, phone number and a default building not declined (BR-15, CN-61). */
export function isProfileComplete(p: { name: string | null; phone: string | null; buildingState: string | null }): boolean {
  return !!p.name && !!p.phone && p.buildingState !== null && p.buildingState !== 'declined'
}
