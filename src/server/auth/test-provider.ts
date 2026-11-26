// The test version of the AuthProvider (B25, B42–B44): stands in for Supabase Auth with no
// network. Auth users, links and failed sign-ins live in the test-only tables (B43); every
// account email goes into `test_mailbox`, read by Playwright through /test/mailbox. Each
// browser context has its own session: a random token in a cookie, kept in `test_sessions`.
// Links work once and for 1 hour, by the clock of `server/clock.ts`, which the
// `test_clock_offset` cookie moves (B59). Low limits (B60) let X4 and X11 reach them.
// Used only when `isTestMode()` is true.
import 'server-only'
import { randomBytes, randomUUID } from 'node:crypto'
import { and, count, eq, gt, isNull } from 'drizzle-orm'
import { cookies } from 'next/headers'
import { getDb } from '@/server/db/client'
import { profiles } from '@/server/db/schema'
import { now } from '@/server/clock'
import type { AuthProvider, LinkType, SessionUser } from './provider'
import { roleOf } from './role'
import { TEST_ACCOUNTS, type TestAccountKey } from './test-accounts'
import { isTestMode } from './test-mode'
import { hashPassword, passwordMatches } from './test-password'
import { testAuthUsers, testMailbox, testSessions, testSignInFailures } from './test-tables'

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
      .where(eq(testAuthUsers.email, email))
    // Like Supabase, nothing is sent for an unknown or confirmed address, and no error says so.
    if (user && !user.confirmedAt) await sendLink(user.id, email, 'signup', date)
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
    const [user] = await db.select().from(testAuthUsers).where(eq(testAuthUsers.email, email))
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

  async isConfirmed(userId) {
    const [user] = await getDb().select({ confirmedAt: testAuthUsers.confirmedAt }).from(testAuthUsers).where(eq(testAuthUsers.id, userId))
    return !!user?.confirmedAt
  },

  async deleteUser(userId) {
    await getDb().delete(testAuthUsers).where(eq(testAuthUsers.id, userId))
  },
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
