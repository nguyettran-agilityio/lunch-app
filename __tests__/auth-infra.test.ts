// @vitest-environment node
// The sign-in infrastructure of M1-2: the account email templates (AC104, X10), the clock
// offset (B59) and the low limits (B60) that work only in the test sign-in mode, the
// Supabase error mapping with a fake client (plan.md section 4), and proxy.ts (B55, CN-65).
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { PgDialect } from 'drizzle-orm/pg-core'

vi.mock('server-only', () => ({}))
const { clockAt } = await import('@/server/clock')
const { testLimitReached, TEST_LIMITS } = await import('@/server/auth/test-provider')
const { createSupabaseProvider, mapSignInError, metadataName } = await import('@/server/auth/supabase-provider')
const { isOpenPath, proxy } = await import('@/proxy')

afterEach(() => {
  vi.unstubAllEnvs()
})

const TEMPLATES = path.resolve(__dirname, '..', 'supabase', 'templates')

describe('AC104 X10 the account emails (BR-29c)', () => {
  it.each([
    ['confirm.html', 'signup', 'Xác nhận tài khoản', 'Confirm your Cơm Lá account'],
    ['reset.html', 'recovery', 'Đặt lại mật khẩu', 'Reset your Cơm Lá password'],
    ['email-change.html', 'email_change', 'Xác nhận email mới', 'Confirm your new email'],
  ])('AC104 X10 %s has the Vietnamese text first, then the English, and links /auth/confirm', (file, type, vi, en) => {
    const html = readFileSync(path.join(TEMPLATES, file), 'utf8')
    expect(html.indexOf(vi)).toBeGreaterThan(-1)
    expect(html.indexOf(en)).toBeGreaterThan(html.indexOf(vi))
    expect(html).toContain(`{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=${type}`)
  })

  it('AC123 Y13 each template gives a subject in both languages, Vietnamese first', () => {
    for (const file of ['confirm.html', 'reset.html', 'email-change.html']) {
      const subject = readFileSync(path.join(TEMPLATES, file), 'utf8').match(/Subject \(CN-70\): (.+?) \/ (.+?)\s*-->/)
      expect(subject, file).not.toBeNull()
      expect(subject![1]).toMatch(/[ạảấầậắặđểệịọốồộớờợụủứừựỳ]/)
      expect(subject![2]).toMatch(/^(Confirm|Reset) your/)
    }
  })
})

const TEST_ENV = { E2E_TEST_AUTH: '1' }
const BASE = new Date('2026-11-26T03:00:00Z')

describe('B59 the clock offset cookie counts only in the test sign-in mode', () => {
  it('moves the clock in the test mode', () => {
    expect(clockAt(BASE, '61', TEST_ENV).date.getTime()).toBe(BASE.getTime() + 61_000)
    expect(clockAt(BASE, '3600', TEST_ENV)).toMatchObject({ today: '2026-11-26', minutes: 11 * 60 })
  })
  it.each([
    ['E2E_TEST_AUTH unset', {}],
    ['VERCEL_ENV set', { ...TEST_ENV, VERCEL_ENV: 'preview' }],
    ['a Supabase variable set', { ...TEST_ENV, NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co' }],
  ])('is ignored with %s', (_label, env) => {
    expect(clockAt(BASE, '3600', env).date.getTime()).toBe(BASE.getTime())
  })
})

describe('B60 the low limits apply only in the test sign-in mode', () => {
  it('refuses from 5 failed sign-ins and 3 emails in the test mode', () => {
    expect(TEST_LIMITS).toMatchObject({ failedSignIns: 5, emails: 3 })
    expect(testLimitReached('signIn', 4, TEST_ENV)).toBe(false)
    expect(testLimitReached('signIn', 5, TEST_ENV)).toBe(true)
    expect(testLimitReached('email', 3, TEST_ENV)).toBe(true)
  })
  it.each([
    ['E2E_TEST_AUTH unset', {}],
    ['VERCEL_ENV set', { ...TEST_ENV, VERCEL_ENV: 'production' }],
    ['a Supabase key set', { ...TEST_ENV, SUPABASE_SECRET_KEY: 'x' }],
  ])('never refuses with %s', (_label, env) => {
    expect(testLimitReached('signIn', 100, env)).toBe(false)
    expect(testLimitReached('email', 100, env)).toBe(false)
  })
})

// A fake Supabase client: only the calls the provider makes, answering what each test gives
// and keeping the arguments of each call.
const calls: Record<string, unknown[]> = {}
function fakeClients(answers: Record<string, unknown>) {
  const call =
    (name: string) =>
    async (...args: unknown[]) => {
      calls[name] = args
      return answers[name]
    }
  const auth = {
    getUser: call('getUser'),
    signOut: call('signOut'),
    signUp: call('signUp'),
    resend: call('resend'),
    signInWithPassword: call('signInWithPassword'),
    verifyOtp: call('verifyOtp'),
    exchangeCodeForSession: call('exchangeCodeForSession'),
    signInWithOAuth: call('signInWithOAuth'),
    resetPasswordForEmail: call('resetPasswordForEmail'),
    admin: { getUserById: call('getUserById'), deleteUser: call('deleteUser') },
  }
  const client = { auth } as never
  sqlRun.length = 0
  return createSupabaseProvider({
    session: async () => client,
    admin: () => client,
    runSql: async (q) => {
      const { sql, params } = new PgDialect().sqlToQuery(q)
      sqlRun.push({ sql, params })
    },
  })
}
const sqlRun: { sql: string; params: unknown[] }[] = []

describe('Google with the Supabase provider and a fake client (plan.md section 1.5)', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://lunch.example/')
  })

  it('AC142 starts Google with the plain /auth/callback of this site and the account chooser every time, without leaving the Server Action', async () => {
    const p = fakeClients({ signInWithOAuth: { data: { url: 'https://accounts.google.test/x' }, error: null } })
    expect(await p.googleSignInUrl()).toBe('https://accounts.google.test/x')
    expect(calls.signInWithOAuth[0]).toEqual({
      provider: 'google',
      options: {
        redirectTo: 'https://lunch.example/auth/callback',
        skipBrowserRedirect: true,
        queryParams: { prompt: 'select_account' },
      },
    })
  })

  it('AC131 reads the identities, whether the email identity was verified, and the first non-blank Google name', async () => {
    const user = {
      id: 'u1',
      email: 'lan@gmail.com',
      user_metadata: { full_name: '  ', name: 'Lan Phạm' },
      identities: [
        { provider: 'email', identity_data: { email_verified: false } },
        { provider: 'google', identity_data: { email_verified: true } },
      ],
    }
    expect(await fakeClients({ exchangeCodeForSession: { data: { user }, error: null } }).exchangeGoogleCode('c1')).toEqual({
      ok: true,
      user: {
        id: 'u1',
        email: 'lan@gmail.com',
        name: 'Lan Phạm',
        identities: [
          { provider: 'email', verified: false },
          { provider: 'google', verified: true },
        ],
      },
    })
    expect(metadataName({ full_name: 'Minh Trần', name: 'x' })).toBe('Minh Trần')
    expect(metadataName({})).toBeNull()
  })

  it('AC136 sends the recovery link back to /auth/confirm of this site, and maps the limit to "Too many attempts"', async () => {
    const p = fakeClients({ resetPasswordForEmail: { data: {}, error: null } })
    expect(await p.sendRecovery('lan@gmail.com')).toEqual({ ok: true })
    expect(calls.resetPasswordForEmail).toEqual(['lan@gmail.com', { redirectTo: 'https://lunch.example/auth/confirm' }])
    const limited = fakeClients({ resetPasswordForEmail: { data: {}, error: { status: 429 } } })
    expect(await limited.sendRecovery('lan@gmail.com')).toEqual({ ok: false, error: 'rateLimited' })
  })

  it('AC133 a code that does not sign in (another browser, used twice) fails', async () => {
    const p = fakeClients({ exchangeCodeForSession: { data: { user: null }, error: { code: 'flow_state_not_found', status: 404 } } })
    expect(await p.exchangeGoogleCode('c1')).toEqual({ ok: false, error: 'failed' })
  })

  it('B62 B63 takes the Google identity off through the database, and clears the confirmation time only when asked', async () => {
    const p = fakeClients({})
    await p.removeGoogleIdentity('u1', { unconfirm: false })
    expect(sqlRun).toEqual([{ sql: `DELETE FROM auth.identities WHERE user_id = $1 AND provider = 'google'`, params: ['u1'] }])
    await p.removeGoogleIdentity('u1', { unconfirm: true })
    expect(sqlRun.map((q) => q.sql)).toEqual([
      `DELETE FROM auth.identities WHERE user_id = $1 AND provider = 'google'`,
      `DELETE FROM auth.identities WHERE user_id = $1 AND provider = 'google'`,
      'UPDATE auth.users SET email_confirmed_at = NULL WHERE id = $1',
    ])
  })
})

describe('the Supabase provider with a fake client (plan.md section 4)', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://lunch.example')
  })

  it('AC98 maps HTTP 429 and the rate-limit codes to "Too many attempts"', async () => {
    expect(mapSignInError({ status: 429 })).toBe('rateLimited')
    expect(mapSignInError({ code: 'over_request_rate_limit' })).toBe('rateLimited')
    const p = fakeClients({
      resend: { error: { code: 'over_email_send_rate_limit', status: 429 } },
      signUp: { data: {}, error: { status: 429 } },
    })
    expect(await p.resendConfirmation('lan@gmail.com')).toEqual({ ok: false, error: 'rateLimited' })
    expect(await p.signUp('lan@gmail.com', 'abcdef12')).toEqual({ ok: false, error: 'rateLimited' })
  })

  it('maps the sign-in errors: wrong password, not confirmed', async () => {
    expect(
      await fakeClients({ signInWithPassword: { data: {}, error: { code: 'invalid_credentials', status: 400 } } }).signInWithPassword(
        'a@b.c',
        'x',
      ),
    ).toEqual({
      ok: false,
      error: 'invalidCredentials',
    })
    expect(
      await fakeClients({ signInWithPassword: { data: {}, error: { code: 'email_not_confirmed', status: 400 } } }).signInWithPassword(
        'a@b.c',
        'x',
      ),
    ).toEqual({
      ok: false,
      error: 'notConfirmed',
    })
  })

  it('treats a sign-up answered with no identity as a taken email (Supabase hides confirmed emails)', async () => {
    expect(
      await fakeClients({ signUp: { data: { user: { id: 'u1', identities: [] } }, error: null } }).signUp('a@b.c', 'abcdef12'),
    ).toEqual({
      ok: false,
      error: 'emailTaken',
    })
    expect(
      await fakeClients({ signUp: { data: { user: { id: 'u1', identities: [{}] } }, error: null } }).signUp('a@b.c', 'abcdef12'),
    ).toEqual({
      ok: true,
      userId: 'u1',
    })
  })

  it('reads the confirmation from the auth user, and an expired link as invalid', async () => {
    expect(
      await fakeClients({ getUserById: { data: { user: { email_confirmed_at: '2026-11-26T03:00:00Z' } }, error: null } }).isConfirmed('u1'),
    ).toBe(true)
    expect(await fakeClients({ getUserById: { data: { user: { email_confirmed_at: null } }, error: null } }).isConfirmed('u1')).toBe(false)
    expect(
      await fakeClients({ getUserById: { data: { user: null }, error: { status: 404, code: 'user_not_found' } } }).isConfirmed('u1'),
    ).toBe(false)
    // Any other error (a wrong secret key, a 500) is not "not confirmed": it ends the action.
    await expect(fakeClients({ getUserById: { data: { user: null }, error: { status: 401 } } }).isConfirmed('u1')).rejects.toThrow()
    await expect(fakeClients({ getUserById: { data: { user: null }, error: { status: 500 } } }).isConfirmed('u1')).rejects.toThrow()
    expect(
      await fakeClients({ verifyOtp: { data: { user: null }, error: { code: 'otp_expired', status: 403 } } }).verifyLink('t', 'signup'),
    ).toEqual({
      ok: false,
      error: 'invalidLink',
    })
  })
})

describe('Y14 the link of the default Supabase template (until M1-4)', () => {
  it('signs up and sends again with the link coming back to /auth/confirm of this site', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://lunch.example/')
    const p = fakeClients({ signUp: { data: { user: { id: 'u1', identities: [{}] } }, error: null }, resend: { error: null } })
    await p.signUp('lan@gmail.com', 'abcdef12')
    expect(calls.signUp[0]).toMatchObject({ options: { emailRedirectTo: 'https://lunch.example/auth/confirm' } })
    await p.resendConfirmation('lan@gmail.com')
    expect(calls.resend[0]).toMatchObject({ type: 'signup', options: { emailRedirectTo: 'https://lunch.example/auth/confirm' } })
  })

  it('exchanges the code once; an expired or unknown code is an invalid link', async () => {
    expect(await fakeClients({ exchangeCodeForSession: { data: { user: { id: 'u1' } }, error: null } }).exchangeCode('c1')).toEqual({
      ok: true,
      userId: 'u1',
    })
    expect(calls.exchangeCodeForSession[0]).toBe('c1')
    expect(
      await fakeClients({
        exchangeCodeForSession: { data: { user: null }, error: { code: 'flow_state_not_found', status: 404 } },
      }).exchangeCode('c1'),
    ).toEqual({ ok: false, error: 'invalidLink' })
  })
})

describe('proxy.ts (B55)', () => {
  const req = (url: string, cookies = '') =>
    new NextRequest(new URL(url, 'http://app.test'), { headers: cookies ? { cookie: cookies } : {} })

  it('lets the prototype, the account pages and the test routes through', () => {
    for (const p of [
      '/proto',
      '/proto/shop',
      '/sign-in',
      '/sign-up',
      '/forgot-password',
      '/auth/confirm',
      '/auth/expired',
      '/test/session',
    ])
      expect(isOpenPath(p)).toBe(true)
    for (const p of ['/', '/shop', '/profile', '/protox', '/sign-inx']) expect(isOpenPath(p)).toBe(false)
  })

  it('X1 sends a visitor not signed in to /sign-in with the page to return to (M1-2 part)', async () => {
    vi.stubEnv('E2E_TEST_AUTH', '1')
    const res = await proxy(req('/shop?day=2'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('http://app.test/sign-in?next=%2Fshop%3Fday%3D2')
    expect((await proxy(req('/'))).headers.get('location')).toBe('http://app.test/sign-in')
    expect((await proxy(req('/proto/cart'))).headers.get('location')).toBeNull()
    expect((await proxy(req('/shop', 'test_session=abc'))).headers.get('location')).toBeNull()
  })
})
