// The test version of the AuthProvider (B25, B42–B44): stands in for Supabase Auth with no
// network. Auth users, links and failed sign-ins live in the test-only tables (B43); every
// account email goes into `test_mailbox`, read by Playwright through /test/mailbox. Each
// browser context has its own session: a random token in a cookie, kept in `test_sessions`.
// Links work once and for 1 hour, by the clock of `server/clock.ts`, which the
// `test_clock_offset` cookie moves (B59). Low limits (B60) let X4 and X11 reach them.
// Used only when `isTestMode()` is true.
import 'server-only'
import { randomBytes, randomUUID } from 'node:crypto'
import { and, count, eq, gt, isNotNull, isNull, sql } from 'drizzle-orm'
import { cookies } from 'next/headers'
import { getDb } from '@/server/db/client'
import { profiles } from '@/server/db/schema'
import { now } from '@/server/clock'
import type { AuthProvider, LinkType, SessionUser } from './provider'
import { roleOf } from './role'
import { TEST_ACCOUNTS, type TestAccountKey } from './test-accounts'
import { isTestMode } from './test-mode'
import { hashPassword, passwordMatches } from './test-password'
import { testAuthUsers, testMailbox, testOAuthCodes, testSessions, testSignInFailures } from './test-tables'

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

async function startSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString('hex')
  await getDb().insert(testSessions).values({ token, userId })
  // A persistent cookie, as Supabase's, so closing the browser keeps the session (CN-64).
  ;(await cookies()).set(TEST_SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 400 * 24 * 60 * 60 })
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
async function sendLink(userId: string, email: string, kind: LinkType, at: Date): Promise<void> {
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
    if (user && !user.confirmedAt) await sendLink(user.id, email, 'signup', date)
    return { ok: true }
  },

  async sendRecovery(email) {
    const { date } = await now()
    if (testLimitReached('email', await emailsSentRecently(email, date))) return { ok: false, error: 'rateLimited' }
    const [user] = await getDb().select({ id: testAuthUsers.id }).from(testAuthUsers).where(eq(testAuthUsers.email, email))
    if (user) await sendLink(user.id, email, 'recovery', date)
    return { ok: true }
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
