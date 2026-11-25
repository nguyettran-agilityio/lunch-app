// The test version of the AuthProvider (B25, B42–B44): signs in the seeded accounts with
// no Supabase. Each browser context has its own session: a random token in a cookie,
// kept in the `test_sessions` table (B43). Used only when `isTestMode()` is true.
import 'server-only'
import { randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { cookies } from 'next/headers'
import { getDb } from '@/server/db/client'
import { profiles } from '@/server/db/schema'
import type { AuthProvider, SessionUser } from './provider'
import { roleOf } from './role'
import { TEST_ACCOUNTS, type TestAccountKey } from './test-accounts'
import { testSessions } from './test-tables'

export const TEST_SESSION_COOKIE = 'test_session'

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

// Test only, not part of the interface: starts a session for a seeded account.
// Returns null when the account was not seeded.
export async function signInAs(key: TestAccountKey): Promise<SessionUser | null> {
  const db = getDb()
  const [profile] = await db.select({ id: profiles.id, email: profiles.email }).from(profiles).where(eq(profiles.id, TEST_ACCOUNTS[key].id))
  if (!profile) return null
  const token = randomBytes(32).toString('hex')
  await db.insert(testSessions).values({ token, userId: profile.id })
  ;(await cookies()).set(TEST_SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', path: '/' })
  return { ...profile, role: roleOf(profile.email) }
}

export const testAuthProvider: AuthProvider = { getUser, signOut }
