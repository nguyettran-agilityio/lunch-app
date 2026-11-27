// The test version of the AuthProvider (B25, B42–B44): stands in for Supabase Auth with no
// network. Auth users, links and failed sign-ins live in the test-only tables (B43); every
// account email goes into `test_mailbox`, read by Playwright through /test/mailbox. Each
// browser context has its own session: a random token in a cookie, kept in `test_sessions`.
// Links work once and for 1 hour, by the clock of `server/clock.ts`, which the
// `test_clock_offset` cookie moves (B59). Low limits (B60) let X4 and X11 reach them.
// Used only when `isTestMode()` is true.
import 'server-only'
import { randomBytes, randomUUID } from 'node:crypto'
import { and, count, eq, gt, isNotNull, isNull, ne, sql } from 'drizzle-orm'
import { cookies } from 'next/headers'
import { getDb } from '@/server/db/client'
import { profiles } from '@/server/db/schema'
import { now } from '@/server/clock'
import type { AuthProvider, LinkType, SessionUser } from './provider'
import { roleOf } from './role'
import { TEST_ACCOUNTS, type TestAccountKey } from './test-accounts'
import { isTestMode } from './test-mode'
import { RESET_COOKIE_PATH, resetCookieExpiry } from './reset-cookies'
import { hashPassword, passwordMatches } from './test-password'
import { testAuthUsers, testMailbox, testMailRefuse, testOAuthCodes, testSessions, testSignInFailures } from './test-tables'

export const TEST_SESSION_COOKIE = 'test_session'

const LINK_LIFETIME_MS = 60 * 60 * 1000
// B60: 5 failed sign-ins in 5 minutes for one account, 3 account emails in one hour to one address.
export const TEST_LIMITS = { failedSignIns: 5, failedWindowMs: 5 * 60 * 1000, emails: 3, emailWindowMs: 60 * 60 * 1000 } as const

type Env = Record<string, string | undefined>

/** True when the low limit of B60 refuses: only in the test mode, never outside it. */
export function testLimitReached(kind: 'signIn' | 'email', recent: number, env: Env = process.env): boolean {
  if (!isTestMode(env)) return false
  return recent >= (kind === 'signIn' ? TEST_LIMITS.failedSignIns : TEST_LIMITS.emails)
}

async function newSessionRow(userId: string): Promise<string> {
  const token = randomBytes(32).toString('hex')
  await getDb().insert(testSessions).values({ token, userId })
  return token
}

async function setSessionCookie(token: string): Promise<void> {
  // A persistent cookie, as Supabase's, so closing the browser keeps the session (CN-64).
  ;(await cookies()).set(TEST_SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 400 * 24 * 60 * 60 })
}

async function startSession(userId: string): Promise<void> {
  await setSessionCookie(await newSessionRow(userId))
}

/** The reset session held aside (CN-73, B67): a `test_sessions` row whose token is in this cookie. */
export const TEST_RESET_SESSION_COOKIE = 'test_reset_session'

async function heldResetSession(): Promise<{ token: string; userId: string; email: string } | null> {
  const token = (await cookies()).get(TEST_RESET_SESSION_COOKIE)?.value
  if (!token) return null
  const [row] = await getDb()
    .select({ token: testSessions.token, userId: testSessions.userId, email: testAuthUsers.email })
    .from(testSessions)
    .innerJoin(testAuthUsers, eq(testAuthUsers.id, testSessions.userId))
    .where(eq(testSessions.token, token))
  return row ?? null
}

async function dropHeldReset(): Promise<void> {
  const jar = await cookies()
  const token = jar.get(TEST_RESET_SESSION_COOKIE)?.value
  if (token) await getDb().delete(testSessions).where(eq(testSessions.token, token))
  jar.delete({ name: TEST_RESET_SESSION_COOKIE, path: RESET_COOKIE_PATH })
}

async function mailRefused(email: string): Promise<boolean> {
  const [row] = await getDb().select().from(testMailRefuse).where(eq(testMailRefuse.email, email.toLowerCase()))
  return !!row
}

async function getUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(TEST_SESSION_COOKIE)?.value
  if (!token) return null
  const [row] = await getDb()
    .select({ id: profiles.id, email: profiles.email })
    .from(testSessions)
    .innerJoin(profiles, eq(profiles.id, testSessions.userId))
    .where(eq(testSessions.token, token))
  return row ? { ...row, role: roleOf(row.email) } : null
}

async function signOut(): Promise<void> {
  const jar = await cookies()
  const token = jar.get(TEST_SESSION_COOKIE)?.value
  if (token) await getDb().delete(testSessions).where(eq(testSessions.token, token))
  jar.delete(TEST_SESSION_COOKIE)
}

async function emailsSentRecently(email: string, at: Date): Promise<number> {
  const [row] = await getDb()
    .select({ n: count() })
    .from(testMailbox)
    .where(and(eq(testMailbox.email, email), gt(testMailbox.sentAt, new Date(at.getTime() - TEST_LIMITS.emailWindowMs))))
  return row.n
}

// "Sends" a link: older unused links of the same kind for this user stop working.
async function sendLink(userId: string, email: string, kind: LinkType | 'recovery', at: Date): Promise<void> {
  const db = getDb()
  await db
    .update(testMailbox)
    .set({ usedAt: at })
    .where(and(eq(testMailbox.userId, userId), eq(testMailbox.kind, kind), isNull(testMailbox.usedAt)))
  await db.insert(testMailbox).values({ id: randomUUID(), email, kind, tokenHash: randomBytes(24).toString('hex'), userId, sentAt: at })
}

const testAuthProvider: AuthProvider = {
  getUser,
  signOut,

  async signUp(email, password) {
    const { date } = await now()
    if (testLimitReached('email', await emailsSentRecently(email, date))) return { ok: false, error: 'rateLimited' }
    const db = getDb()
    const [taken] = await db.select({ id: testAuthUsers.id }).from(testAuthUsers).where(eq(testAuthUsers.email, email))
    if (taken) return { ok: false, error: 'emailTaken' }
    // As Supabase when its first email cannot be sent: no user is kept (CN-74, AC156).
    if (await mailRefused(email)) return { ok: false, error: 'sendFailed' }
    const userId = randomUUID()
    await db.insert(testAuthUsers).values({ id: userId, email, passwordHash: hashPassword(password), createdAt: date })
    await sendLink(userId, email, 'signup', date)
    return { ok: true, userId }
  },

  async resendConfirmation(email) {
    const { date } = await now()
    if (testLimitReached('email', await emailsSentRecently(email, date))) return { ok: false, error: 'rateLimited' }
    const [user] = await getDb()
      .select({ id: testAuthUsers.id, confirmedAt: testAuthUsers.confirmedAt })
      .from(testAuthUsers)
      .where(and(eq(testAuthUsers.email, email), isNotNull(testAuthUsers.passwordHash)))
    // Like Supabase, nothing is sent for an unknown or confirmed address, and no error says so.
    if (user && !user.confirmedAt) {
      if (await mailRefused(email)) return { ok: false, error: 'sendFailed' }
      await sendLink(user.id, email, 'signup', date)
    }
    return { ok: true }
  },

  // `at` is the time the app logs: the mailbox row keeps it, so the link's /auth/reset/link/<sent>
  // carries it (CN-74).
  async sendRecovery(email, at) {
    if (testLimitReached('email', await emailsSentRecently(email, at))) return { ok: false, error: 'rateLimited' }
    const [user] = await getDb().select({ id: testAuthUsers.id }).from(testAuthUsers).where(eq(testAuthUsers.email, email))
    if (user && (await mailRefused(email))) return { ok: false, error: 'sendFailed' }
    if (user) await sendLink(user.id, email, 'recovery', at)
    return { ok: true }
  },

  async heldResetUser() {
    const held = await heldResetSession()
    return held ? { id: held.userId, email: held.email } : null
  },

  // As the Supabase version (B67): the link is used on a session held aside, in its own cookie;
  // a password equal to the stored one keeps that session for the next try.
  async resetPassword(link, password) {
    const { date } = await now()
    const db = getDb()
    let held = await heldResetSession()
    if (!held) {
      const [row] = await db.select().from(testMailbox).where(eq(testMailbox.tokenHash, link.tokenHash))
      const usable =
        row && row.kind === 'recovery' && row.usedAt === null && row.userId && date.getTime() - row.sentAt.getTime() <= LINK_LIFETIME_MS
      if (!usable || !row.userId) {
        await dropHeldReset()
        return { ok: false, error: 'invalidLink' }
      }
      await db.update(testMailbox).set({ usedAt: date }).where(eq(testMailbox.id, row.id))
      // Using a recovery link confirms the email, as Supabase's recoverVerify does (W3).
      await db
        .update(testAuthUsers)
        .set({ confirmedAt: date })
        .where(and(eq(testAuthUsers.id, row.userId), isNull(testAuthUsers.confirmedAt)))
      const token = await newSessionRow(row.userId)
      const [user] = await db.select({ email: testAuthUsers.email }).from(testAuthUsers).where(eq(testAuthUsers.id, row.userId))
      ;(await cookies()).set(TEST_RESET_SESSION_COOKIE, token, {
        httpOnly: true,
        sameSite: 'lax',
        path: RESET_COOKIE_PATH,
        expires: resetCookieExpiry(link.sent, date),
      })
      held = { token, userId: row.userId, email: user?.email ?? '' }
    }
    const [user] = await db.select().from(testAuthUsers).where(eq(testAuthUsers.id, held.userId))
    if (!user) {
      await dropHeldReset()
      return { ok: false, error: 'invalidLink' }
    }
    if (user.passwordHash && passwordMatches(password, user.passwordHash)) return { ok: false, error: 'samePassword' }
    await db
      .update(testAuthUsers)
      .set({ passwordHash: hashPassword(password) })
      .where(eq(testAuthUsers.id, user.id))
    // Every other device of the account (CN-64, AC100), then any other session of this browser,
    // another account's too (CN-74, AC157); the held session becomes this browser's.
    await db.delete(testSessions).where(and(eq(testSessions.userId, user.id), ne(testSessions.token, held.token)))
    const jar = await cookies()
    const current = jar.get(TEST_SESSION_COOKIE)?.value
    if (current && current !== held.token) await db.delete(testSessions).where(eq(testSessions.token, current))
    await setSessionCookie(held.token)
    jar.delete({ name: TEST_RESET_SESSION_COOKIE, path: RESET_COOKIE_PATH })
    return { ok: true, userId: user.id }
  },

  dropHeldReset,

  async hasPassword(userId) {
    const [user] = await getDb().select({ hash: testAuthUsers.passwordHash }).from(testAuthUsers).where(eq(testAuthUsers.id, userId))
    return !!user?.hash
  },

  async signInWithPassword(email, password) {
    const { date } = await now()
    const db = getDb()
    const [recent] = await db
      .select({ n: count() })
      .from(testSignInFailures)
      .where(and(eq(testSignInFailures.email, email), gt(testSignInFailures.at, new Date(date.getTime() - TEST_LIMITS.failedWindowMs))))
    if (testLimitReached('signIn', recent.n)) return { ok: false, error: 'rateLimited' }
    const [user] = await db
      .select()
      .from(testAuthUsers)
      .where(and(eq(testAuthUsers.email, email), isNotNull(testAuthUsers.passwordHash)))
    if (!user || !passwordMatches(password, user.passwordHash)) {
      await db.insert(testSignInFailures).values({ id: randomUUID(), email, at: date })
      return { ok: false, error: 'invalidCredentials' }
    }
    if (!user.confirmedAt) return { ok: false, error: 'notConfirmed' }
    await startSession(user.id)
    return { ok: true, userId: user.id }
  },

  async verifyLink(tokenHash, type) {
    const { date } = await now()
    const db = getDb()
    const [link] = await db.select().from(testMailbox).where(eq(testMailbox.tokenHash, tokenHash))
    const expired =
      !link || link.kind !== type || link.usedAt !== null || !link.userId || date.getTime() - link.sentAt.getTime() > LINK_LIFETIME_MS
    if (expired || !link.userId) return { ok: false, error: 'invalidLink' }
    await db.update(testMailbox).set({ usedAt: date }).where(eq(testMailbox.id, link.id))
    if (type === 'signup') await db.update(testAuthUsers).set({ confirmedAt: date }).where(eq(testAuthUsers.id, link.userId))
    await startSession(link.userId)
    return { ok: true, userId: link.userId }
  },

  // The default template's link comes back with a code (CN-71); here the code is the token of
  // the mailbox row, with the same rules: once, within 1 hour, a confirmation link.
  async exchangeCode(code) {
    return this.verifyLink(code, 'signup')
  },

  async isConfirmed(userId) {
    const [user] = await getDb().select({ confirmedAt: testAuthUsers.confirmedAt }).from(testAuthUsers).where(eq(testAuthUsers.id, userId))
    return !!user?.confirmedAt
  },

  async deleteUser(userId) {
    await getDb().delete(testAuthUsers).where(eq(testAuthUsers.id, userId))
  },

  // The stand-in for Google's page: /test/google reads what the test asked for.
  async googleSignInUrl() {
    return '/test/google'
  },

  // Does what Supabase does with a Google sign-in, by the code's outcome when the email is
  // already a user's (plan.md section 1.5): 'linked' joins the Google identity and sets the
  // confirmation time (the worst case for the guard, B63); 'dropped' removes the password
  // identity (CN-63); 'new' makes another user. An unknown email makes a new Google user.
  async exchangeGoogleCode(code) {
    const { date } = await now()
    const db = getDb()
    const [row] = await db.select().from(testOAuthCodes).where(eq(testOAuthCodes.code, code))
    if (!row || row.usedAt || date.getTime() - row.createdAt.getTime() > 10 * 60 * 1000) return { ok: false, error: 'failed' }
    await db.update(testOAuthCodes).set({ usedAt: date }).where(eq(testOAuthCodes.code, code))
    const email = row.email.toLowerCase()
    const [existing] = await db.select().from(testAuthUsers).where(eq(testAuthUsers.email, email))
    let user: { id: string; identities: { provider: 'email' | 'google'; verified: boolean }[] }
    if (!existing || row.outcome === 'new') {
      const id = randomUUID()
      await db.insert(testAuthUsers).values({ id, email, confirmedAt: date, identities: ['google'], createdAt: date })
      user = { id, identities: [{ provider: 'google', verified: true }] }
    } else if (existing.identities.includes('google') && !existing.identities.includes('email')) {
      user = { id: existing.id, identities: [{ provider: 'google', verified: true }] }
    } else if (existing.identities.length === 0) {
      // A CN-63 account after its reset has no identity row (B66): Google is linked alone and
      // the password stays, so the guard reaches `hasPassword` (N12).
      await db
        .update(testAuthUsers)
        .set({ identities: ['google'] })
        .where(eq(testAuthUsers.id, existing.id))
      user = { id: existing.id, identities: [{ provider: 'google', verified: true }] }
    } else if (row.outcome === 'dropped') {
      await db
        .update(testAuthUsers)
        .set({ passwordHash: null, identities: ['google'], confirmedAt: date })
        .where(eq(testAuthUsers.id, existing.id))
      user = { id: existing.id, identities: [{ provider: 'google', verified: true }] }
    } else {
      await db
        .update(testAuthUsers)
        .set({ identities: ['email', 'google'], confirmedAt: existing.confirmedAt ?? date })
        .where(eq(testAuthUsers.id, existing.id))
      user = {
        id: existing.id,
        identities: [
          { provider: 'email', verified: !!existing.confirmedAt },
          { provider: 'google', verified: true },
        ],
      }
    }
    await startSession(user.id)
    return { ok: true, user: { ...user, email, name: row.name } }
  },

  async removeGoogleIdentity(userId, { unconfirm }) {
    await getDb()
      .update(testAuthUsers)
      .set({
        identities: sql`array_remove(${testAuthUsers.identities}, 'google')`,
        ...(unconfirm ? { confirmedAt: null } : {}),
      })
      .where(eq(testAuthUsers.id, userId))
  },
}

/** What the test asked the stand-in for Google to answer, from its `test_google` cookie. */
export type TestGoogle = { email?: string; name?: string | null; outcome?: 'linked' | 'dropped' | 'new'; error?: boolean }

/** /test/google: a code for /auth/callback, or Google's cancel error (AC130). */
export async function testGoogleAnswer(ask: TestGoogle | null): Promise<string> {
  if (!ask?.email || ask.error) return '/auth/callback?error=access_denied&error_description=cancelled'
  const code = randomBytes(24).toString('hex')
  const { date } = await now()
  await getDb()
    .insert(testOAuthCodes)
    .values({ code, email: ask.email, name: ask.name ?? null, outcome: ask.outcome ?? 'linked', createdAt: date })
  return `/auth/callback?code=${code}`
}

export { testAuthProvider }

// Test only, not part of the interface: starts a session for a seeded account.
// Returns null when the account was not seeded.
export async function signInAs(key: TestAccountKey): Promise<SessionUser | null> {
  const [profile] = await getDb()
    .select({ id: profiles.id, email: profiles.email })
    .from(profiles)
    .where(eq(profiles.id, TEST_ACCOUNTS[key].id))
  if (!profile) return null
  await startSession(profile.id)
  return { ...profile, role: roleOf(profile.email) }
}
