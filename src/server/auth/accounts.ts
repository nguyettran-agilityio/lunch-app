// The account rules of sign-up, sign-in and "send the confirmation link again" (BR-29a,
// CN-60 to CN-68, plan.md section 1.5), the same for the Supabase and the test provider.
// Every function takes its database, provider and time, so Vitest runs it on PGlite with a
// fake provider. Results carry message codes; the texts are in i18n.ts (`auth`).
import 'server-only'
import { desc, eq } from 'drizzle-orm'
import { checkSignIn, checkSignUp, readIdentifier, type FieldError, type Identifier, type NoticeCode } from '@/domain/account'
import type { Lang } from '@/domain/types'
import type { AnyDb } from '@/server/db/client'
import { authMailLog, profiles } from '@/server/db/schema'
import type { AuthProvider } from './provider'

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

async function logMail(db: AnyDb, email: string, at: Date): Promise<void> {
  await db.insert(authMailLog).values({ email, kind: 'confirm', sentAt: at })
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
  // TODO(E1, plan.md "Open for the Lead", decided by the Lead in M1-3): a Google account has
  // no confirmation link; until the Lead decides, it gets the message the other pages give a
  // Google account (Claude's proposal (b)).
  if (state === 'google') return error({}, { notice: { code: 'googleAccount' } })
  if (state === 'confirmed') return error({}, { notice: { code: 'alreadyConfirmed' } })
  const wait = await mailWait(db, p.email, at)
  const identifier = id.kind === 'phone' ? id.phone : id.email
  if (wait > 0) return { status: 'wait', sendAgain: { identifier, wait } }
  const sent = await auth.resendConfirmation(p.email)
  if (!sent.ok) return error({}, { notice: { code: 'tooMany' } })
  await logMail(db, p.email, at)
  return { status: 'sent', sendAgain: { identifier, wait: SEND_AGAIN_SECONDS } }
}

export type SignInResult = { status: 'signedIn'; profile: Profile } | Extract<FormState, { status: 'error' }>

/** Sign-in with a phone number or an email and the password (BR-29a, CN-60, CN-65). */
export async function signIn(deps: Deps, input: { identifier: string; password: string }): Promise<SignInResult> {
  const { db, auth, at } = deps
  const checked = checkSignIn(input)
  if ('errors' in checked) return { status: 'error', fields: checked.errors }
  const p = await byIdentifier(db, checked.identifier)
  if (!p) return { status: 'error', fields: {}, notice: { code: 'noAccount' } }
  // TODO(E4, plan.md "Open for the Lead", decided by the Lead in M1-3): signing in with the
  // phone number of a Google account gives the same message as its email (Claude's proposal (a)).
  if (p.method === 'google') return { status: 'error', fields: {}, notice: { code: 'googleAccount' } }
  const result = await auth.signInWithPassword(p.email, checked.password)
  if (result.ok) return { status: 'signedIn', profile: p }
  if (result.error === 'rateLimited') return { status: 'error', fields: {}, notice: { code: 'tooMany' } }
  if (result.error === 'invalidCredentials') return { status: 'error', fields: {}, notice: { code: 'wrongPassword' } }
  const identifier = checked.identifier.kind === 'phone' ? checked.identifier.phone : checked.identifier.email
  return { status: 'error', fields: {}, notice: { code: 'notConfirmed', identifier, wait: await mailWait(db, p.email, at) } }
}
