// The account rules of sign-up, sign-in and "send the confirmation link again" (BR-29a,
// CN-60 to CN-68, plan.md section 1.5), the same for the Supabase and the test provider.
// Every function takes its database, provider and time, so Vitest runs it on PGlite with a
// fake provider. Results carry message codes; the texts are in i18n.ts (`auth`).
import 'server-only'
import { and, desc, eq, gt, lt } from 'drizzle-orm'
import { isValidPassword } from '@/domain/password'
import {
  checkEmail,
  checkName,
  checkPhone,
  checkSignIn,
  checkSignUp,
  googleName,
  readIdentifier,
  type FieldError,
  type GoogleRefusal,
  type Identifier,
  type NoticeCode,
} from '@/domain/account'
import type { Lang } from '@/domain/types'
import { inTransaction, type AnyDb } from '@/server/db/client'
import { authMailLog, buildings, profiles, usedResetLinks } from '@/server/db/schema'
import type { AuthProvider, ResetLink } from './provider'
import { RESET_LINK_MS, resetDigest } from './reset-cookies'
import { roleOf } from './role'

/** The 60-second wait between account emails to one address, whatever their kind (CN-67). */
export const SEND_AGAIN_SECONDS = 60

export type Deps = { db: AnyDb; auth: AuthProvider; at: Date }

export type Notice = { code: NoticeCode; identifier?: string; wait?: number }
export type SendAgain = { identifier: string; wait: number }

export type FormState =
  | { status: 'idle' }
  | { status: 'error'; fields: Partial<Record<string, FieldError>>; sendAgain?: Partial<Record<string, SendAgain>>; notice?: Notice }
  | { status: 'sent'; sendAgain: SendAgain }
  // Nothing sent: the 60-second wait of that address still runs (CN-68).
  | { status: 'wait'; sendAgain: SendAgain }

type Profile = typeof profiles.$inferSelect
type AccountState = 'confirmed' | 'waiting' | 'google'

const error = (
  fields: Partial<Record<string, FieldError>>,
  extra: Omit<Extract<FormState, { status: 'error' }>, 'status' | 'fields'> = {},
): FormState => ({
  status: 'error',
  fields,
  ...extra,
})

/** Seconds left before another account email may go to this address (0 when it may). */
export async function mailWait(db: AnyDb, email: string, at: Date): Promise<number> {
  const [last] = await db
    .select({ sentAt: authMailLog.sentAt })
    .from(authMailLog)
    .where(eq(authMailLog.email, email))
    .orderBy(desc(authMailLog.sentAt))
    .limit(1)
  if (!last) return 0
  const left = SEND_AGAIN_SECONDS - (at.getTime() - last.sentAt.getTime()) / 1000
  return left > 0 ? Math.ceil(left) : 0
}

async function logMail(db: AnyDb, email: string, at: Date, kind: 'confirm' | 'reset' | 'change' = 'confirm'): Promise<void> {
  await db.insert(authMailLog).values({ email, kind, sentAt: at })
}

/** Whether an account is confirmed, waiting for its email, or a Google account (CN-63). */
export async function accountState(auth: AuthProvider, p: Profile): Promise<AccountState> {
  if (p.method === 'google') return 'google'
  if (p.needsPassword) return 'waiting'
  return (await auth.isConfirmed(p.id)) ? 'confirmed' : 'waiting'
}

async function byPhone(db: AnyDb, phone: string): Promise<Profile | undefined> {
  const [p] = await db.select().from(profiles).where(eq(profiles.phone, phone))
  return p
}

async function byEmail(db: AnyDb, email: string): Promise<Profile | undefined> {
  const [p] = await db.select().from(profiles).where(eq(profiles.email, email))
  return p
}

async function byIdentifier(db: AnyDb, id: Identifier): Promise<Profile | undefined> {
  return id.kind === 'phone' ? byPhone(db, id.phone) : byEmail(db, id.email)
}

async function deleteAccount({ db, auth }: Deps, p: Profile): Promise<void> {
  // The auth user first: if that fails, nothing is changed and its links still work as before.
  await auth.deleteUser(p.id)
  await db.delete(profiles).where(eq(profiles.id, p.id))
}

/**
 * Sign-up with phone, email and password (plan.md section 1.5, cases 1 to 4). A refused
 * sign-up changes nothing (CN-67); a repeated sign-up of a waiting account stores the language
 * in use (CN-68); waiting accounts that match one field are replaced, and the new account's
 * first email goes at once, without the 60-second wait (CN-62, CN-63, CN-68).
 */
export async function signUp(deps: Deps, input: { phone: string; email: string; password: string }, lang: Lang): Promise<FormState> {
  const { db, auth, at } = deps
  const checked = checkSignUp(input)
  if ('errors' in checked) return error(checked.errors)
  const { phone, email, password } = checked.values

  const pPhone = await byPhone(db, phone)
  const pEmail = await byEmail(db, email)
  const [pending] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.pendingEmail, email))
  const sPhone = pPhone && (await accountState(auth, pPhone))
  const sEmail = pEmail && (await accountState(auth, pEmail))

  // (1) The phone and the email of one waiting account: nothing created, nothing sent.
  if (pPhone && pEmail && pPhone.id === pEmail.id && sPhone === 'waiting') {
    await db.update(profiles).set({ lang }).where(eq(profiles.id, pPhone.id))
    return { status: 'sent', sendAgain: { identifier: phone, wait: await mailWait(db, email, at) } }
  }

  // (2), (3), (3b): an email held by a confirmed or Google account, or waiting as another
  // account's new email (CN-65); a phone held by a confirmed account.
  const fields: Partial<Record<string, FieldError>> = {}
  const sendAgain: Partial<Record<string, SendAgain>> = {}
  if (sEmail === 'google') fields.email = 'emailTakenGoogle'
  else if (sEmail === 'confirmed') fields.email = 'emailTakenPhone'
  else if (pending && pending.id !== pPhone?.id) fields.email = 'emailWaiting'
  if (sPhone === 'confirmed' || sPhone === 'google') fields.phone = 'phoneTaken'
  else if (sPhone === 'waiting' && fields.email) {
    fields.phone = 'phoneWaiting'
    sendAgain.phone = { identifier: phone, wait: await mailWait(db, pPhone!.email, at) }
  }
  if (Object.keys(fields).length) return error(fields, Object.keys(sendAgain).length ? { sendAgain } : {})

  // (4) Only waiting accounts match: each is deleted and its links stop working. (One account
  // holding both fields was answered above, so these are two different ones.) The waiting
  // account of the email goes first, because the sign-in service knows an account by its email;
  // the one of the phone only once the new account exists, so a refusal (for example the
  // service's limit) leaves it as it was. A refusal after the email's waiting account was
  // deleted loses that account: the Lead accepted this exception (CN-70).
  if (pEmail) await deleteAccount(deps, pEmail)

  const created = await auth.signUp(email, password)
  if (!created.ok) {
    if (created.error === 'rateLimited') return error({}, { notice: { code: 'tooMany' } })
    // The service could not send the first email: nothing is created (CN-74, AC156).
    if (created.error === 'sendFailed') return error({}, { notice: { code: 'sendFailed' } })
    return error({ email: 'emailTakenPhone' })
  }
  if (pPhone) await deleteAccount(deps, pPhone)
  try {
    await db.insert(profiles).values({ id: created.userId, phone, email, method: 'password', lang })
  } catch (e) {
    // Another sign-up took the phone or the email at the same moment: undo, nothing is kept.
    await auth.deleteUser(created.userId)
    const text = String((e as { cause?: unknown })?.cause ?? e)
    return error(text.includes('phone') ? { phone: 'phoneTaken' } : { email: 'emailTakenPhone' })
  }
  await logMail(db, email, at)
  return { status: 'sent', sendAgain: { identifier: phone, wait: SEND_AGAIN_SECONDS } }
}

/**
 * "Send again", "Send the confirmation link again" and "Send a new link" of a sign-up
 * (BR-29a, CN-61, CN-64, CN-67, CN-68): a new confirmation link to the waiting account of a
 * phone number or email, after the 60-second wait of that address.
 */
export async function sendConfirmation(deps: Deps, rawIdentifier: string): Promise<FormState> {
  const { db, auth, at } = deps
  const id = readIdentifier(rawIdentifier)
  if (typeof id === 'string') return error({ identifier: id })
  const p = await byIdentifier(db, id)
  if (!p) return error({}, { notice: { code: 'noAccount' } })
  const state = await accountState(auth, p)
  // A Google account has no confirmation link: the message of "Forgot password" (CN-72, AC126).
  if (state === 'google') return error({}, { notice: { code: 'googleAccount' } })
  if (state === 'confirmed') return error({}, { notice: { code: 'alreadyConfirmed' } })
  const wait = await mailWait(db, p.email, at)
  const identifier = id.kind === 'phone' ? id.phone : id.email
  if (wait > 0) return { status: 'wait', sendAgain: { identifier, wait } }
  // An account whose password the sign-in service removed gets the link that confirms the
  // email and sets the password again, only to its own email (CN-63, CN-72, AC136).
  const sent = p.needsPassword ? await auth.sendRecovery(p.email, at) : await auth.resendConfirmation(p.email)
  if (!sent.ok) return error({}, { notice: { code: sent.error === 'sendFailed' ? 'sendFailed' : 'tooMany' } })
  await logMail(db, p.email, at, p.needsPassword ? 'reset' : 'confirm')
  return { status: 'sent', sendAgain: { identifier, wait: SEND_AGAIN_SECONDS } }
}

/**
 * "Forgot password", its "Send again", and "Send a new link" of an expired reset link (BR-29a,
 * CN-61, CN-73): the answers of a phone number or email, then a reset link to a confirmed
 * account after the 60-second wait of its address. An account not confirmed, also one that
 * needs a password (CN-63), gets "You have not confirmed your email" with the button, and
 * nothing is sent here (AC69, AC145, AC148).
 */
export async function forgotPassword(deps: Deps, rawIdentifier: string): Promise<FormState> {
  const { db, auth, at } = deps
  const id = readIdentifier(rawIdentifier)
  if (typeof id === 'string') return error({ identifier: id })
  const p = await byIdentifier(db, id)
  if (!p) return error({}, { notice: { code: 'noAccount' } })
  const identifier = id.kind === 'phone' ? id.phone : id.email
  const state = await accountState(auth, p)
  // Found by its email or by the phone on its profile (AC56, AC143).
  if (state === 'google') return error({}, { notice: { code: 'googleAccount' } })
  const wait = await mailWait(db, p.email, at)
  if (state === 'waiting') return error({}, { notice: { code: 'notConfirmed', identifier, wait } })
  if (wait > 0) return { status: 'wait', sendAgain: { identifier, wait } }
  const sent = await auth.sendRecovery(p.email, at)
  if (!sent.ok) return error({}, { notice: { code: sent.error === 'sendFailed' ? 'sendFailed' : 'tooMany' } })
  await logMail(db, p.email, at, 'reset')
  return { status: 'sent', sendAgain: { identifier, wait: SEND_AGAIN_SECONDS } }
}

/** Why /auth/reset/link/<sent> opens the expired page at once (CN-74, AC153), or null. */
export async function resetLinkRefusal(db: AnyDb, link: ResetLink | null, at: Date): Promise<'invalidLink' | null> {
  if (!link || !Number.isFinite(link.sent) || at.getTime() - link.sent > RESET_LINK_MS) return 'invalidLink'
  const [used] = await db
    .select({ digest: usedResetLinks.digest })
    .from(usedResetLinks)
    .where(eq(usedResetLinks.digest, resetDigest(link.tokenHash)))
  return used ? 'invalidLink' : null
}

/**
 * A reset link replaced by a newer reset email to the same address (CN-75, AC161), found in the
 * email log without using the link: the reset row sent at `<sent>`, then a newer one.
 */
async function replacedLink(db: AnyDb, link: ResetLink): Promise<boolean> {
  const rows = await db
    .select({ email: authMailLog.email })
    .from(authMailLog)
    .where(and(eq(authMailLog.kind, 'reset'), eq(authMailLog.sentAt, new Date(link.sent))))
  // Reset emails to two addresses in the same millisecond: the address is not known, so the
  // sign-in service decides when saving.
  const emails = new Set(rows.map((r) => r.email))
  if (emails.size !== 1) return false
  const [newer] = await db
    .select({ sentAt: authMailLog.sentAt })
    .from(authMailLog)
    .where(and(eq(authMailLog.email, [...emails][0]), eq(authMailLog.kind, 'reset'), gt(authMailLog.sentAt, new Date(link.sent))))
    .limit(1)
  return !!newer
}

export type ResetResult =
  // `profile` is null only when the auth user has no profile (none is expected): signed in all the same.
  | { status: 'saved'; profile: Profile | null }
  | { status: 'invalidLink' }
  | { status: 'error'; fields: Partial<Record<string, FieldError>>; notice?: Notice }

/**
 * Saving the new password on /auth/reset (BR-29a, CN-64, CN-73, CN-74, CN-75): the link first,
 * whatever was typed (CN-75): it must still be within its hour by `at` (the test clock moves
 * it), not already saved, and, when a session is held aside from an earlier try, the newest
 * reset email of that account (else it was replaced, or its time changed by hand); then the
 * password rule. A saved link is recorded; an account that needed a password (CN-63) no longer
 * does, and its Google identity is taken off (B66).
 */
export async function resetPassword(deps: Deps, link: ResetLink | null, password: string): Promise<ResetResult> {
  const { db, auth, at } = deps
  if (!link || (await resetLinkRefusal(db, link, at))) return { status: 'invalidLink' }
  const held = await auth.heldResetUser()
  if (held) {
    const [last] = await db
      .select({ sentAt: authMailLog.sentAt })
      .from(authMailLog)
      .where(and(eq(authMailLog.email, held.email.toLowerCase()), eq(authMailLog.kind, 'reset')))
      .orderBy(desc(authMailLog.sentAt))
      .limit(1)
    if (!last || last.sentAt.getTime() !== link.sent) return { status: 'invalidLink' }
  } else if (await replacedLink(db, link)) return { status: 'invalidLink' }
  if (!password) return { status: 'error', fields: { password: 'required' } }
  if (!isValidPassword(password)) return { status: 'error', fields: { password: 'passwordRule' } }
  const result = await auth.resetPassword(link, password)
  if (!result.ok) {
    if (result.error === 'samePassword') return { status: 'error', fields: { password: 'samePassword' } }
    if (result.error === 'rateLimited') return { status: 'error', fields: {}, notice: { code: 'tooMany' } }
    return { status: 'invalidLink' }
  }
  // Rows older than 1 hour by the server's own time: in production that is `at`; in the test
  // sign-in mode each browser context moves its own clock (B59), and one far ahead must not
  // delete the rows of the others.
  await db.delete(usedResetLinks).where(lt(usedResetLinks.usedAt, new Date(Date.now() - RESET_LINK_MS)))
  await db
    .insert(usedResetLinks)
    .values({ digest: resetDigest(link.tokenHash), usedAt: at })
    .onConflictDoNothing()
  const [p] = await db.select().from(profiles).where(eq(profiles.id, result.userId))
  if (p?.needsPassword) {
    await auth.removeGoogleIdentity(p.id, { unconfirm: false })
    await db.update(profiles).set({ needsPassword: false }).where(eq(profiles.id, p.id))
  }
  return { status: 'saved', profile: p ? { ...p, needsPassword: false } : null }
}

export type SignInResult = { status: 'signedIn'; profile: Profile } | Extract<FormState, { status: 'error' }>

/** Sign-in with a phone number or an email and the password (BR-29a, CN-60, CN-65). */
export async function signIn(deps: Deps, input: { identifier: string; password: string }): Promise<SignInResult> {
  const { db, auth, at } = deps
  const checked = checkSignIn(input)
  if ('errors' in checked) return { status: 'error', fields: checked.errors }
  const p = await byIdentifier(db, checked.identifier)
  if (!p) return { status: 'error', fields: {}, notice: { code: 'noAccount' } }
  // The email of a Google account, or the phone number on its profile (CN-72, AC127).
  if (p.method === 'google') return { status: 'error', fields: {}, notice: { code: 'googleAccount' } }
  const identifier = checked.identifier.kind === 'phone' ? checked.identifier.phone : checked.identifier.email
  // The service removed this account's password (CN-63): there is none left to check, so any
  // password gets "not confirmed" with the button (CN-72, AC136).
  if (p.needsPassword)
    return { status: 'error', fields: {}, notice: { code: 'notConfirmed', identifier, wait: await mailWait(db, p.email, at) } }
  const result = await auth.signInWithPassword(p.email, checked.password)
  if (result.ok) return { status: 'signedIn', profile: p }
  if (result.error === 'rateLimited') return { status: 'error', fields: {}, notice: { code: 'tooMany' } }
  if (result.error === 'invalidCredentials') return { status: 'error', fields: {}, notice: { code: 'wrongPassword' } }
  return { status: 'error', fields: {}, notice: { code: 'notConfirmed', identifier, wait: await mailWait(db, p.email, at) } }
}

export type GoogleResult = { status: 'signedIn'; profile: Profile } | { status: 'refused'; code: GoogleRefusal; email?: string }

const refused = (code: GoogleRefusal, email?: string): GoogleResult => ({ status: 'refused', code, ...(email ? { email } : {}) })

/**
 * The code of /auth/callback after "Continue with Google" (plan.md section 1.5): the linking
 * guard and the first Google sign-in. The guard looks at the result, not at one Supabase
 * behaviour (CN-62, CN-63): for the email of a phone + password account, a new auth user
 * (another id) is deleted; on the same user with both identities the Google identity is taken
 * off (B62), and for a waiting account the confirmation time Google set is cleared (B63); on
 * the same user left with only the Google identity, the user is kept and its profile marked
 * `needs_password` (CN-63). Each refusal signs this browser out. A new Google user whose
 * email waits as another account's new email is deleted (CN-65, CN-72); otherwise its profile
 * is created with Google's name (CN-72) and the language in use (BR-30).
 */
export async function googleSignIn(deps: Deps, code: string | null, lang: Lang): Promise<GoogleResult> {
  const { db, auth } = deps
  if (!code) return refused('googleFailed')
  const exchanged = await auth.exchangeGoogleCode(code)
  if (!exchanged.ok) return refused('googleFailed')
  const u = exchanged.user
  const email = u.email.trim().toLowerCase()
  const p = await byEmail(db, email)

  if (p && p.method === 'password') {
    const emailIdentity = u.identities.find((i) => i.provider === 'email')
    let waiting: boolean
    if (u.id !== p.id) {
      // Supabase made another user: the phone + password account itself is untouched.
      waiting = p.needsPassword || !(await auth.isConfirmed(p.id))
      await auth.signOut()
      await auth.deleteUser(u.id)
    } else if (emailIdentity) {
      // Joined by automatic linking: the email identity tells whether it was confirmed.
      waiting = p.needsPassword || !emailIdentity.verified
      await auth.removeGoogleIdentity(u.id, { unconfirm: waiting && !p.needsPassword })
      await auth.signOut()
    } else if (!p.needsPassword && (await auth.hasPassword(u.id))) {
      // A CN-63 account whose new password was saved has no identity row left, so Google came
      // back alone: it is a phone + password account; the Google identity goes again (B66, AC154).
      waiting = false
      await auth.removeGoogleIdentity(u.id, { unconfirm: false })
      await auth.signOut()
    } else {
      // The sign-in service dropped the unconfirmed password identity (CN-63): the user stays.
      waiting = true
      await auth.signOut()
      await db.update(profiles).set({ needsPassword: true }).where(eq(profiles.id, p.id))
    }
    return waiting ? refused('googleNotConfirmed', email) : refused('googleTakenPhone')
  }

  if (p) {
    if (p.id === u.id) return { status: 'signedIn', profile: p }
    // A Google profile whose auth user is another one: nothing to sign in to.
    await auth.signOut()
    return refused('googleFailed')
  }

  // A first Google sign-in. An email waiting as another account's new email is taken (CN-65):
  // the same for Lan herself, whose waiting address is not her account's email (CN-72).
  const [pending] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.pendingEmail, email))
  if (pending) {
    await auth.signOut()
    await auth.deleteUser(u.id)
    return refused('googleWaiting')
  }
  try {
    const [created] = await db
      .insert(profiles)
      .values({ id: u.id, email, method: 'google', name: googleName(u.name), lang })
      .returning()
    return { status: 'signedIn', profile: created }
  } catch {
    // Another sign-up took the email at the same moment: undo, nothing is kept.
    await auth.signOut()
    await auth.deleteUser(u.id)
    return refused('googleFailed')
  }
}

export type ProfileInput = { name: string; phone: string; email: string; buildingId: string }

export type ProfileState =
  | { status: 'idle' }
  /** `emailWait`: the new email is still within the 60-second wait of its address (CN-78, AC185). */
  | { status: 'error'; fields: Partial<Record<keyof ProfileInput, FieldError>>; notice?: Notice; emailWait?: number }
  /** `wasComplete`: whether the profile was complete before this Save (CN-65, CN-77). */
  | { status: 'saved'; wasComplete: boolean }

/** Whether a customer may pick this building: approved, or pending and proposed by them (BR-16, CN-78). */
async function usableBuilding(db: AnyDb, id: string, userId: string): Promise<{ state: string } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const [b] = await db.select({ state: buildings.state, proposedBy: buildings.proposedBy }).from(buildings).where(eq(buildings.id, id))
  if (!b) return null
  return b.state === 'approved' || (b.state === 'pending' && b.proposedBy === userId) ? b : null
}

/**
 * Save on the profile, S-C2 (BR-29a, CN-64, CN-77, CN-78). Every field is checked first; any
 * refusal, a new email within its 60-second wait or past the service's limit, or an email that
 * cannot be sent saves nothing (AC178, AC185). The customer's own email typed again is no change
 * and cancels a waiting one (AC175); the waiting email typed again (also the field left as it
 * was, since it is prefilled with it, AC191) changes nothing (AC176). A Google account's email
 * is not changed (AC54). Only once every field passes are the name, the phone number and the
 * building saved and the link sent. All in one transaction that locks the profile row, so two
 * Saves at the same time are checked one after the other; the email is sent before the write,
 * and taken back (`cancelEmailChange`, B70) when the write fails (plan.md, PR M1-5).
 */
export async function saveProfile(deps: Deps, userId: string, input: ProfileInput): Promise<ProfileState> {
  // The provider's own database calls (B62, B70) run in this transaction too.
  return inTransaction(deps.db, (tx) => saveProfileLocked({ ...deps, db: tx }, userId, input))
}

async function saveProfileLocked(deps: Deps, userId: string, input: ProfileInput): Promise<ProfileState> {
  const { db, auth, at } = deps
  const [p] = await db.select().from(profiles).where(eq(profiles.id, userId)).for('update')
  if (!p) return { status: 'error', fields: {}, notice: { code: 'noAccount' } }
  const fields: Partial<Record<keyof ProfileInput, FieldError>> = {}

  const name = checkName(input.name)
  if ('error' in name) fields.name = name.error

  const phone = checkPhone(input.phone)
  if ('error' in phone) fields.phone = phone.error
  else if (phone.phone !== p.phone) {
    // Checked as at sign-up (BR-29a), without "Send again" for a waiting account (CN-63, AC92).
    const other = await byPhone(db, phone.phone)
    if (other) fields.phone = (await accountState(auth, other)) === 'waiting' ? 'phoneWaiting' : 'phoneTaken'
  }

  const before = p.buildingId ? await db.select({ state: buildings.state }).from(buildings).where(eq(buildings.id, p.buildingId)) : []
  const wasComplete = isComplete(p, before[0]?.state ?? null)
  // A declined building is not offered, so it cannot be saved again (CN-78, AC188).
  if (!input.buildingId || !(await usableBuilding(db, input.buildingId, userId))) fields.buildingId = 'required'

  let change: { kind: 'none' } | { kind: 'cancel' } | { kind: 'change'; email: string } = { kind: 'none' }
  let emailWait = 0
  if (p.method === 'password') {
    const email = checkEmail(input.email)
    if ('error' in email) fields.email = email.error
    else if (email.email === p.email) change = p.pendingEmail ? { kind: 'cancel' } : { kind: 'none' }
    else if (email.email === p.pendingEmail) change = { kind: 'none' }
    else if (roleOf(email.email) === 'shop') fields.email = 'emailShop'
    else {
      const other = await byEmail(db, email.email)
      const [pending] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.pendingEmail, email.email))
      // An account waiting for confirmation (CN-64), or another account's waiting new email (CN-65).
      if (other) fields.email = (await accountState(auth, other)) === 'waiting' ? 'emailWaiting' : 'emailTaken'
      else if (pending) fields.email = 'emailWaiting'
      else {
        change = { kind: 'change', email: email.email }
        emailWait = await mailWait(db, email.email, at)
      }
    }
  }
  if (Object.keys(fields).length || emailWait > 0)
    return { status: 'error', fields, ...(emailWait > 0 && !fields.email ? { emailWait } : {}) }
  if (!('name' in name) || !('phone' in phone)) return { status: 'error', fields }

  if (change.kind === 'change') {
    const sent = await auth.changeEmail(userId, change.email, at)
    if (!sent.ok) {
      if (sent.error === 'rateLimited') return { status: 'error', fields: { email: 'tooMany' } }
      if (sent.error === 'emailTaken') return { status: 'error', fields: { email: 'emailTaken' } }
      return { status: 'error', fields: {}, notice: { code: 'sendFailed' } }
    }
    // The email went out: its 60-second wait counts whatever happens to the write (CN-67).
    await logMail(db, change.email, at, 'change')
  }
  try {
    // A savepoint: a refused write rolls back only itself, and the transaction can still end.
    await db.transaction(async (sp) => {
      await sp
        .update(profiles)
        .set({
          name: name.name,
          phone: phone.phone,
          buildingId: input.buildingId,
          ...(change.kind === 'change' ? { pendingEmail: change.email } : change.kind === 'cancel' ? { pendingEmail: null } : {}),
        })
        .where(eq(profiles.id, userId))
    })
  } catch (e) {
    // Another account took the phone or the address in between: the change is taken back, and
    // the message is the one of the account that took it (CN-64, CN-65).
    if (change.kind === 'change') await auth.cancelEmailChange(userId)
    const text = String((e as { cause?: unknown })?.cause ?? e)
    if (text.includes('phone')) return { status: 'error', fields: { phone: 'phoneTaken' } }
    // As the check before: an account waiting for confirmation, or another's waiting new email,
    // is "waiting"; any other account is "already has an account" (CN-64, CN-65).
    const taken = change.kind === 'change' ? await byEmail(db, change.email) : undefined
    const confirmed = taken && (await accountState(auth, taken)) !== 'waiting'
    return { status: 'error', fields: { email: confirmed ? 'emailTaken' : 'emailWaiting' } }
  }
  // Only once the cancel is saved is the change taken back in the sign-in service, so a refused
  // write leaves the waiting email and its link as they were (AC175).
  if (change.kind === 'cancel') await auth.cancelEmailChange(userId)
  return { status: 'saved', wasComplete }
}

const isComplete = (p: Profile, buildingState: string | null) =>
  !!p.name && !!p.phone && buildingState !== null && buildingState !== 'declined'

/**
 * "Send again" of "Waiting for confirmation of <new email>" and "Send a new link" of an expired
 * email-change link (BR-29a, CN-65, CN-77, CN-78): a new link to the address waiting now, for the
 * account signed in, after the 60-second wait of that address; older links stop working (AC186).
 */
export async function sendEmailChange(deps: Deps, userId: string): Promise<FormState> {
  const { db, auth, at } = deps
  const [p] = await db.select().from(profiles).where(eq(profiles.id, userId))
  if (!p?.pendingEmail) return error({}, { notice: { code: 'noPendingEmail' } })
  const email = p.pendingEmail
  const wait = await mailWait(db, email, at)
  if (wait > 0) return { status: 'wait', sendAgain: { identifier: email, wait } }
  const sent = await auth.changeEmail(userId, email, at)
  if (!sent.ok) return error({}, { notice: { code: sent.error === 'rateLimited' ? 'tooMany' : 'sendFailed' } })
  await logMail(db, email, at, 'change')
  return { status: 'sent', sendAgain: { identifier: email, wait: SEND_AGAIN_SECONDS } }
}

/** The email-change link was used: the new email is the account's, nothing waits (CN-77). */
export async function confirmEmailChange(db: AnyDb, userId: string, email: string): Promise<void> {
  await db.update(profiles).set({ email: email.trim().toLowerCase(), pendingEmail: null }).where(eq(profiles.id, userId))
}

/** How long the email of an AC91 refusal is kept for "Send the confirmation link again" (CN-72). */
export const GOOGLE_REFUSAL_SECONDS = 60 * 60

/**
 * "Send the confirmation link again" after an AC91 refusal (CN-72, AC134): `kept` is the email
 * and the time of the refusal that the callback stored; missing or more than 1 hour old, nothing
 * is sent and the answer is "Could not sign in with Google, please try again".
 */
export async function sendGoogleConfirmation(deps: Deps, kept: { email: string; at: number } | null): Promise<FormState> {
  if (!kept || deps.at.getTime() - kept.at > GOOGLE_REFUSAL_SECONDS * 1000) return error({}, { notice: { code: 'googleFailed' } })
  return sendConfirmation(deps, kept.email)
}
