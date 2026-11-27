// @vitest-environment node
// The cookies of a reset link (plan.md PR M1-4, B67, B68): `reset_link` and the `sb-reset`
// cookies of the session held aside live on path /auth, expire with the link's hour, and are
// deleted on that same path; the held client uses its own cookie name.
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

type Set = { name: string; value: string; options: Record<string, unknown> }
const jar = {
  store: new Map<string, string>(),
  sets: [] as Set[],
  deletes: [] as unknown[],
  get: (name: string) => (jar.store.has(name) ? { name, value: jar.store.get(name)! } : undefined),
  getAll: () => [...jar.store].map(([name, value]) => ({ name, value })),
  set: (name: string, value: string, options: Record<string, unknown> = {}) => {
    jar.sets.push({ name, value, options })
    jar.store.set(name, value)
  },
  delete: (arg: unknown) => {
    jar.deletes.push(arg)
    jar.store.delete(typeof arg === 'string' ? arg : (arg as { name: string }).name)
  },
}
vi.mock('next/headers', () => ({ cookies: async () => jar }))

const created: { options: Record<string, unknown> }[] = []
vi.mock('@supabase/ssr', () => ({
  createServerClient: (_url: string, _key: string, options: Record<string, unknown>) => {
    created.push({ options })
    return { options }
  },
}))

const { clearResetLink, getResetLink, resetCookieExpiry, setResetLink } = await import('@/server/auth/reset-cookies')
const { RESET_SESSION_COOKIE, dropResetCookies, resetClient } = await import('@/server/auth/supabase-provider')

const T0 = new Date('2026-11-26T03:00:00Z')

beforeEach(() => {
  jar.store.clear()
  jar.sets.length = 0
  jar.deletes.length = 0
  created.length = 0
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://x.supabase.test')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test')
})

describe('the reset_link cookie (B67)', () => {
  it('AC149 N7 keeps the link httpOnly on /auth until the earlier of its hour and one hour from now', async () => {
    await setResetLink({ tokenHash: 'tok', sent: T0.getTime() }, new Date(T0.getTime() + 10 * 60 * 1000))
    const [set] = jar.sets
    expect(set.name).toBe('reset_link')
    expect(set.options).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/auth' })
    expect((set.options.expires as Date).getTime()).toBe(T0.getTime() + 60 * 60 * 1000)
    expect(await getResetLink()).toEqual({ tokenHash: 'tok', sent: T0.getTime() })
    // A <sent> in the future, changed by hand: the cookie still lives at most one hour from now.
    expect(resetCookieExpiry(T0.getTime() + 5 * 60 * 60 * 1000, T0).getTime()).toBe(T0.getTime() + 60 * 60 * 1000)
  })

  it('AC153 N11 is deleted on its own path, and a broken cookie reads as no link', async () => {
    await clearResetLink()
    expect(jar.deletes).toEqual([{ name: 'reset_link', path: '/auth' }])
    jar.store.set('reset_link', 'not json')
    expect(await getResetLink()).toBeNull()
  })
})

describe('the session held aside (B67, B68)', () => {
  it('AC146 AC149 the held client has its own cookie name, on /auth, expiring with the link instead of 400 days', async () => {
    await setResetLink({ tokenHash: 'tok', sent: Date.now() }, new Date())
    jar.sets.length = 0
    await resetClient()
    const { options } = created[0]
    expect(options.cookieOptions).toEqual({ name: RESET_SESSION_COOKIE })
    const cookies = options.cookies as { getAll: () => { name: string }[]; setAll: (l: Set[]) => void }
    jar.store.set('sb-x-auth-token', 'main')
    jar.store.set('sb-reset.0', 'held')
    expect(cookies.getAll().map((c) => c.name)).toEqual(['sb-reset.0'])
    cookies.setAll([{ name: 'sb-reset.0', value: 'v', options: { path: '/', maxAge: 400 * 24 * 60 * 60, sameSite: 'lax' } }])
    const [written] = jar.sets
    expect(written.options).toMatchObject({ path: '/auth', sameSite: 'lax' })
    expect(written.options).not.toHaveProperty('maxAge')
    expect((written.options.expires as Date).getTime()).toBeLessThanOrEqual(Date.now() + 60 * 60 * 1000)
    // A deletion by @supabase/ssr (maxAge 0) stays a deletion, on /auth.
    cookies.setAll([{ name: 'sb-reset.0', value: '', options: { path: '/', maxAge: 0 } }])
    expect(jar.sets[1].options).toMatchObject({ path: '/auth', maxAge: 0 })
  })

  it('AC153 B68 its cookies are deleted on /auth, the main session cookies kept', async () => {
    jar.store.set('sb-reset.0', 'a')
    jar.store.set('sb-reset.1', 'b')
    jar.store.set('sb-x-auth-token', 'main')
    await dropResetCookies()
    expect(jar.deletes).toEqual([
      { name: 'sb-reset.0', path: '/auth' },
      { name: 'sb-reset.1', path: '/auth' },
    ])
    expect(jar.store.has('sb-x-auth-token')).toBe(true)
  })
})
