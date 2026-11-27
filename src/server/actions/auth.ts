'use server'
// Server Actions of the account screens (plan.md section 1.5): thin wrappers that read the
// request (cookies, the clock, the provider) and call the rules of `server/auth/accounts.ts`.
import { eq } from 'drizzle-orm'
import { refresh } from 'next/cache'
import { redirect } from 'next/navigation'
import { afterSignIn, isProfileComplete } from '@/domain/account'
import type { Lang } from '@/domain/types'
import * as accounts from '@/server/auth/accounts'
import { getGoogleRefused, setGoogleStart } from '@/server/auth/google-cookies'
import { getAuthProvider } from '@/server/auth/provider'
import { clearResetLink, getResetLink } from '@/server/auth/reset-cookies'
import { roleOf } from '@/server/auth/role'
import { now } from '@/server/clock'
import { getDb } from '@/server/db/client'
import { buildings, profiles } from '@/server/db/schema'
import { currentAccount, getLang, setLangCookie } from '@/server/session'

async function deps(): Promise<accounts.Deps> {
  return { db: getDb(), auth: await getAuthProvider(), at: (await now()).date }
}

const text = (fd: FormData, name: string) => String(fd.get(name) ?? '')

export async function signUpAction(_prev: accounts.FormState, fd: FormData): Promise<accounts.FormState> {
  // A new account stores the language in use (CN-67), and so does a repeated sign-up (CN-68).
  return accounts.signUp(
    await deps(),
    { phone: text(fd, 'phone'), email: text(fd, 'email'), password: text(fd, 'password') },
    await getLang(),
  )
}

export async function sendConfirmationAction(identifier: string): Promise<accounts.FormState> {
  return accounts.sendConfirmation(await deps(), identifier)
}

/** The form of /auth/expired?type=signup: the phone number or email typed there. */
export async function sendNewLinkAction(_prev: accounts.FormState, fd: FormData): Promise<accounts.FormState> {
  return accounts.sendConfirmation(await deps(), text(fd, 'identifier'))
}

/** The form of /forgot-password and of /auth/expired?type=recovery (CN-61, CN-73). */
export async function forgotPasswordAction(_prev: accounts.FormState, fd: FormData): Promise<accounts.FormState> {
  return accounts.forgotPassword(await deps(), text(fd, 'identifier'))
}

/** "Send again" on the "The reset link is sent" card. */
export async function sendResetAgainAction(identifier: string): Promise<accounts.FormState> {
  return accounts.forgotPassword(await deps(), identifier)
}

export type ResetFormState = Exclude<accounts.ResetResult, { status: 'saved' | 'invalidLink' }> | { status: 'idle' }

/**
 * "Save the new password" on /auth/reset (CN-64, CN-73, CN-74): an expired, used or replaced
 * link opens the expired page; once saved, the account's language goes to the browser as at
 * sign-in (CN-60) and the person goes where signing in leads, with no `next` (AC151, AC152).
 */
export async function resetPasswordAction(_prev: ResetFormState, fd: FormData): Promise<ResetFormState> {
  const d = await deps()
  const result = await accounts.resetPassword(d, await getResetLink(), text(fd, 'password'))
  if (result.status === 'error') return result
  await clearResetLink()
  if (result.status === 'invalidLink') {
    await d.auth.dropHeldReset()
    redirect('/auth/expired?type=recovery')
  }
  const p = result.profile
  // Signed in already; with no profile (none is expected) the home page sorts it out.
  if (!p) redirect('/')
  await setLangCookie(p.lang)
  const [b] = p.buildingId ? await getDb().select({ state: buildings.state }).from(buildings).where(eq(buildings.id, p.buildingId)) : []
  const complete = isProfileComplete({ name: p.name, phone: p.phone, buildingState: b?.state ?? null })
  redirect(afterSignIn({ role: roleOf(p.email), complete }))
}

export async function signInAction(_prev: accounts.FormState, fd: FormData): Promise<accounts.FormState> {
  const result = await accounts.signIn(await deps(), { identifier: text(fd, 'identifier'), password: text(fd, 'password') })
  if (result.status !== 'signedIn') return result
  const p = result.profile
  // Signing in copies the account's language to the browser: the account wins (CN-60).
  await setLangCookie(p.lang)
  const [b] = p.buildingId ? await getDb().select({ state: buildings.state }).from(buildings).where(eq(buildings.id, p.buildingId)) : []
  const complete = isProfileComplete({ name: p.name, phone: p.phone, buildingState: b?.state ?? null })
  redirect(afterSignIn({ role: roleOf(p.email), complete, next: text(fd, 'next') }))
}

/**
 * "Continue with Google" on the Sign in or Sign up tab (plan.md section 1.5): keeps the tab and
 * the page to return to for the callback (CN-72), and gives where Google is (in the test
 * sign-in mode, its stand-in); the page goes there with a full navigation, as for any page
 * outside the app.
 */
export async function startGoogleAction(fd: FormData): Promise<string> {
  const tab = text(fd, 'tab') === 'signUp' ? 'signUp' : 'signIn'
  const next = text(fd, 'next') || null
  await setGoogleStart({ tab, next })
  return (await getAuthProvider()).googleSignInUrl()
}

/** "Send the confirmation link again" under the Google button after an AC91 refusal (AC134). */
export async function sendGoogleConfirmationAction(): Promise<accounts.FormState> {
  return accounts.sendGoogleConfirmation(await deps(), await getGoogleRefused())
}

export async function signOutAction(): Promise<void> {
  await (await getAuthProvider()).signOut()
  redirect('/sign-in')
}

/**
 * The VI/EN switch: the browser always, and the account too when someone is signed in (BR-30);
 * on a page with the top bar of someone signed out (`browserOnly`, the reset page, CN-75,
 * AC162), only the browser.
 */
export async function setLangAction(lang: Lang, browserOnly = false): Promise<void> {
  if (lang !== 'vi' && lang !== 'en') return
  await setLangCookie(lang)
  const account = browserOnly ? null : await currentAccount()
  if (account) await getDb().update(profiles).set({ lang }).where(eq(profiles.id, account.user.id))
  refresh()
}
