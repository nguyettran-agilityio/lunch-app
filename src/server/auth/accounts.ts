// The account rules of sign-up, sign-in and "send the confirmation link again" (BR-29a,
// CN-60 to CN-68, plan.md section 1.5), the same for the Supabase and the test provider.
// Every function takes its database, provider and time, so Vitest runs it on PGlite with a
// fake provider. Results carry message codes; the texts are in i18n.ts (`auth`).
import 'server-only'
import { and, desc, eq, gt, lt } from 'drizzle-orm'
import { isValidPassword } from '@/domain/password'
import {
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
import type { AnyDb } from '@/server/db/client'
import { authMailLog, profiles, usedResetLinks } from '@/server/db/schema'
import type { AuthProvider, ResetLink } from './provider'
import { RESET_LINK_MS, resetDigest } from './reset-cookies'

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

async function logMail(db: AnyDb, email: string, at: Date, kind: 'confirm' | 'reset' = 'confirm'): Promise<void> {
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
