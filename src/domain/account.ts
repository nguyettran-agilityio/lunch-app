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

/** A message about the whole action, shown as a Notice at the top of the card (UI17). */
export type NoticeCode = 'wrongPassword' | 'noAccount' | 'googleAccount' | 'notConfirmed' | 'tooMany' | 'alreadyConfirmed'

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

/**
 * Where the app goes after signing in, and for someone already signed in who opens /sign-in or
 * /sign-up (CN-65, CN-69): a shop account to /shop; a customer whose profile is incomplete to
 * the profile first (from PR M1-5; until then to /, plan.md section 1.5); else `next`, or /.
 */
export function afterSignIn({ role, complete, next }: { role: 'customer' | 'shop'; complete: boolean; next?: string | null }): string {
  if (role === 'shop') return '/shop'
  if (!complete) return '/'
  return returnPath(next, role) ?? '/'
}

/** A complete profile: name, phone number and a default building not declined (BR-15, CN-61). */
export function isProfileComplete(p: { name: string | null; phone: string | null; buildingState: string | null }): boolean {
  return !!p.name && !!p.phone && p.buildingState !== null && p.buildingState !== 'declined'
}
