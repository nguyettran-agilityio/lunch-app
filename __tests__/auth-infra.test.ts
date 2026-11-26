// @vitest-environment node
// The sign-in infrastructure of M1-2: the account email templates (AC104, X10), the clock
// offset (B59) and the low limits (B60) that work only in the test sign-in mode, the
// Supabase error mapping with a fake client (plan.md section 4), and proxy.ts (B55, CN-65).
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))
const { clockAt } = await import('@/server/clock')
const { testLimitReached, TEST_LIMITS } = await import('@/server/auth/test-provider')
const { createSupabaseProvider, mapSignInError } = await import('@/server/auth/supabase-provider')
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

// A fake Supabase client: only the calls the provider makes, answering what each test gives.
function fakeClients(answers: Record<string, unknown>) {
  const call = (name: string) => async () => answers[name]
  const auth = {
    getUser: call('getUser'),
    signOut: call('signOut'),
    signUp: call('signUp'),
    resend: call('resend'),
    signInWithPassword: call('signInWithPassword'),
    verifyOtp: call('verifyOtp'),
    admin: { getUserById: call('getUserById'), deleteUser: call('deleteUser') },
  }
  const client = { auth } as never
  return createSupabaseProvider({ session: async () => client, admin: () => client })
}

describe('the Supabase provider with a fake client (plan.md section 4)', () => {
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
