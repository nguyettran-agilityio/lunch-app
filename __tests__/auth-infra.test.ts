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
  ])('AC104 X10 %s has the Vietnamese text first, then the English, and links the address the app sent', (file, type, vi, en) => {
    const html = readFileSync(path.join(TEMPLATES, file), 'utf8')
    expect(html.indexOf(vi)).toBeGreaterThan(-1)
    expect(html.indexOf(en)).toBeGreaterThan(html.indexOf(vi))
    // B64: the link starts with the address the app sent (/auth/confirm, or /auth/reset/link/<sent>
    // for a reset, B67), so each branch's preview gets its own.
    expect(html).toContain(`{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=${type}`)
    expect(html).not.toContain('{{ .SiteURL }}')
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
function fakeClients(answers: Record<string, unknown>, reset: Record<string, unknown> = {}) {
  const call =
    (name: string, from = answers, prefix = '') =>
    async (...args: unknown[]) => {
      calls[`${prefix}${name}`] = args
      order.push(`${prefix}${name}`)
      const a = from[name]
      return typeof a === 'function' ? a(...args) : a
    }
  const auth = {
    getUser: call('getUser'),
    getSession: call('getSession'),
    setSession: call('setSession'),
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
  const resetAuth = Object.fromEntries(
    ['getSession', 'getUser', 'verifyOtp', 'updateUser', 'signOut'].map((n) => [n, call(n, reset, 'reset.')]),
  )
  const client = { auth } as never
  sqlRun.length = 0
  order.length = 0
  dropped.n = 0
  return createSupabaseProvider({
    session: async () => client,
    admin: () => client,
    reset: async () => ({ auth: resetAuth }) as never,
    dropReset: async () => {
      dropped.n++
      order.push('dropReset')
    },
    runSql: async (q) => {
      const { sql, params } = new PgDialect().sqlToQuery(q)
      sqlRun.push({ sql, params })
      return sqlAnswer.rows
    },
  })
}
const sqlRun: { sql: string; params: unknown[] }[] = []
const sqlAnswer: { rows: unknown } = { rows: [] }
const order: string[] = []
const dropped = { n: 0 }

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

  it('AC136 AC20 sends the reset link to /auth/reset/link/<sent> of this site, and maps the limit to "Too many attempts"', async () => {
    const at = new Date('2026-11-26T03:00:00Z')
    const p = fakeClients({ resetPasswordForEmail: { data: {}, error: null } })
    expect(await p.sendRecovery('lan@gmail.com', at)).toEqual({ ok: true })
    expect(calls.resetPasswordForEmail).toEqual(['lan@gmail.com', { redirectTo: `https://lunch.example/auth/reset/link/${at.getTime()}` }])
    const limited = fakeClients({ resetPasswordForEmail: { data: {}, error: { status: 429 } } })
    expect(await limited.sendRecovery('lan@gmail.com', at)).toEqual({ ok: false, error: 'rateLimited' })
  })

  it('AC100 AC157 N8 saving uses the link on the held client, signs out the other devices, then this browser takes the session', async () => {
    let held = 0
    const session = { access_token: 'a1', refresh_token: 'r1' }
    const p = fakeClients(
      { getSession: { data: { session: { access_token: 'shop' } } }, signOut: { error: null }, setSession: { error: null } },
      {
        // No session held yet, then the one the link created.
        getSession: () => ({ data: { session: held++ === 0 ? null : session } }),
        verifyOtp: { data: { session, user: { id: 'u1' } }, error: null },
        updateUser: { data: { user: { id: 'u1' } }, error: null },
        signOut: { error: null },
      },
    )
    expect(await p.resetPassword({ tokenHash: 'tok', sent: 1 }, 'abcdef34')).toEqual({ ok: true, userId: 'u1' })
    expect(calls['reset.verifyOtp']).toEqual([{ token_hash: 'tok', type: 'recovery' }])
    expect(calls['reset.updateUser']).toEqual([{ password: 'abcdef34' }])
    expect(calls['reset.signOut']).toEqual([{ scope: 'others' }])
    // Another account signed in on this browser is signed out for good, before the new session.
    expect(calls.signOut).toEqual([{ scope: 'local' }])
    expect(calls.setSession).toEqual([session])
    expect(order.indexOf('reset.updateUser')).toBeLessThan(order.indexOf('reset.signOut'))
    expect(order.indexOf('signOut')).toBeLessThan(order.indexOf('setSession'))
    expect(dropped.n).toBe(1)
  })

  it('AC150 N8 a password equal to the old one keeps the held session; a session error is the expired page', async () => {
    const same = fakeClients(
      {},
      {
        getSession: { data: { session: { access_token: 'a1' } } },
        updateUser: { data: { user: null }, error: { code: 'same_password', status: 422 } },
      },
    )
    expect(await same.resetPassword({ tokenHash: 'tok', sent: 1 }, 'lan12345')).toEqual({ ok: false, error: 'samePassword' })
    expect(order).not.toContain('reset.verifyOtp')
    expect(dropped.n).toBe(0)
    const gone = fakeClients(
      {},
      {
        getSession: { data: { session: { access_token: 'a1' } } },
        updateUser: { data: { user: null }, error: { code: 'session_not_found', status: 403 } },
      },
    )
    expect(await gone.resetPassword({ tokenHash: 'tok', sent: 1 }, 'abcdef34')).toEqual({ ok: false, error: 'invalidLink' })
    expect(dropped.n).toBe(1)
    const used = fakeClients(
      {},
      { getSession: { data: { session: null } }, verifyOtp: { data: { session: null }, error: { code: 'otp_expired', status: 403 } } },
    )
    expect(await used.resetPassword({ tokenHash: 'tok', sent: 1 }, 'abcdef34')).toEqual({ ok: false, error: 'invalidLink' })
    expect(order).not.toContain('reset.updateUser')
  })

  it('AC153 B68 dropping the held session signs it out at Supabase first, then deletes its cookies', async () => {
    const p = fakeClients({}, { getSession: { data: { session: { access_token: 'a1' } } }, signOut: { error: null } })
    await p.dropHeldReset()
    expect(calls['reset.signOut']).toEqual([{ scope: 'local' }])
    expect(order.indexOf('reset.signOut')).toBeGreaterThan(-1)
    expect(order.indexOf('reset.signOut')).toBeLessThan(order.indexOf('dropReset'))
    expect(dropped.n).toBe(1)
    const none = fakeClients({}, { getSession: { data: { session: null } } })
    await none.dropHeldReset()
    expect(order).not.toContain('reset.signOut')
    expect(dropped.n).toBe(1)
  })

  it('AC154 N12 hasPassword reads auth.users; NULL and an empty string both mean no password', async () => {
    const p = fakeClients({})
    sqlAnswer.rows = [{ has: true }]
    expect(await p.hasPassword('u1')).toBe(true)
    expect(sqlRun[0]).toEqual({
      sql: `SELECT (encrypted_password IS NOT NULL AND encrypted_password <> '') AS has FROM auth.users WHERE id = $1`,
      params: ['u1'],
    })
    sqlAnswer.rows = { rows: [{ has: false }] }
    expect(await p.hasPassword('u1')).toBe(false)
    sqlAnswer.rows = []
    expect(await p.hasPassword('u1')).toBe(false)
  })

  it('AC156 a 5xx answer to a send is "Could not send the email"; other errors still throw', async () => {
    const at = new Date('2026-11-26T03:00:00Z')
    const p = fakeClients({
      resetPasswordForEmail: { data: {}, error: { code: 'unexpected_failure', status: 500 } },
      resend: { error: { status: 500 } },
      signUp: { data: {}, error: { status: 500 } },
    })
    expect(await p.sendRecovery('huy@gmail.com', at)).toEqual({ ok: false, error: 'sendFailed' })
    expect(await p.resendConfirmation('huy@gmail.com')).toEqual({ ok: false, error: 'sendFailed' })
    expect(await p.signUp('huy@gmail.com', 'abcdef12')).toEqual({ ok: false, error: 'sendFailed' })
    const odd = fakeClients({ resetPasswordForEmail: { data: {}, error: { code: 'validation_failed', status: 400 } } })
    await expect(odd.sendRecovery('huy@gmail.com', at)).rejects.toThrow()
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
