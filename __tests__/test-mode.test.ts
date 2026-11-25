// @vitest-environment node
// The test sign-in mode check (docs/test-scenarios.md section 20, B25, B46, B47): one
// function decides for both instrumentation.ts and the /test/* routes.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { register } from '@/instrumentation'
import { SUPABASE_VARS, isTestMode, testModeConflict } from '@/server/auth/test-mode'
import { roleOf } from '@/server/auth/role'
import { GET as signInRoute } from '@/app/test/sign-in/route'
import { GET as sessionRoute } from '@/app/test/session/route'

vi.mock('server-only', () => ({}))
// connection() needs a request scope; outside Next it has nothing to wait for.
vi.mock('next/server', async (actual) => ({ ...(await actual<typeof import('next/server')>()), connection: async () => {} }))
// The routes must answer before they touch the session or the database.
vi.mock('@/server/auth/test-provider', () => {
  throw new Error('the test provider must not load when the test mode is off')
})

const CONFLICTS: [string, Record<string, string>][] = [
  ['VERCEL_ENV', { VERCEL_ENV: 'preview' }],
  ...SUPABASE_VARS.map((name): [string, Record<string, string>] => [name, { [name]: 'x' }]),
]

afterEach(() => {
  vi.unstubAllEnvs()
})

// Clears every variable the check reads, then sets the given ones.
function env(vars: Record<string, string>) {
  for (const name of ['E2E_TEST_AUTH', 'VERCEL_ENV', ...SUPABASE_VARS]) vi.stubEnv(name, undefined)
  for (const [name, value] of Object.entries(vars)) vi.stubEnv(name, value)
}

describe('E4 server start (B25, B46)', () => {
  it.each(CONFLICTS)('refuses E2E_TEST_AUTH=1 together with %s, naming it', (name, vars) => {
    env({ E2E_TEST_AUTH: '1', ...vars })
    expect(() => register()).toThrow(name)
    expect(isTestMode()).toBe(false)
  })

  it('exits with code 1 on the Node.js runtime, so `next start` does not keep running', () => {
    env({ E2E_TEST_AUTH: '1', SUPABASE_SERVICE_ROLE_KEY: 'x' })
    vi.stubEnv('NEXT_RUNTIME', 'nodejs')
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      // process.exit is mocked here, so register goes on to throw as well.
      expect(() => register()).toThrow()
      expect(exit).toHaveBeenCalledWith(1)
      expect(error).toHaveBeenCalledWith(expect.stringContaining('SUPABASE_SERVICE_ROLE_KEY'))
    } finally {
      exit.mockRestore()
      error.mockRestore()
    }
  })

  it.each(['0', '', 'true'])('B48 starts with E2E_TEST_AUTH="%s", even next to Supabase and Vercel, with the test mode off', (value) => {
    env({ E2E_TEST_AUTH: value, VERCEL_ENV: 'production', SUPABASE_SERVICE_ROLE_KEY: 'x' })
    expect(() => register()).not.toThrow()
    expect(isTestMode()).toBe(false)
  })

  it('counts a variable set to an empty string as set', () => {
    expect(testModeConflict({ E2E_TEST_AUTH: '1', SUPABASE_SERVICE_ROLE_KEY: '' })).toContain('SUPABASE_SERVICE_ROLE_KEY')
  })

  it('starts with E2E_TEST_AUTH unset, Supabase and Vercel variables or not', () => {
    env({ VERCEL_ENV: 'production', NEXT_PUBLIC_SUPABASE_URL: 'x', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'x', SUPABASE_SERVICE_ROLE_KEY: 'x' })
    expect(() => register()).not.toThrow()
    expect(isTestMode()).toBe(false)
  })

  it('starts in the test mode alone', () => {
    env({ E2E_TEST_AUTH: '1' })
    expect(() => register()).not.toThrow()
    expect(isTestMode()).toBe(true)
  })
})

describe('E3 the /test/* routes answer 404 unless the test mode is fully on (B42, B46)', () => {
  const routes = {
    '/test/sign-in': () => signInRoute(new NextRequest('http://localhost/test/sign-in?account=customer')),
    '/test/session': () => sessionRoute(),
  }
  const offCases: [string, Record<string, string>][] = [
    ['E2E_TEST_AUTH unset', {}],
    ['E2E_TEST_AUTH=0', { E2E_TEST_AUTH: '0' }],
    ...CONFLICTS.map(([name, vars]): [string, Record<string, string>] => [`E2E_TEST_AUTH=1 with ${name}`, { E2E_TEST_AUTH: '1', ...vars }]),
  ]
  for (const [route, call] of Object.entries(routes)) {
    it.each(offCases)(`${route}: 404 with %s`, async (_, vars) => {
      env(vars)
      expect((await call()).status).toBe(404)
    })
  }
})

describe('role from SHOP_EMAILS (B17)', () => {
  it('is shop for a listed email in any case and with spaces, else customer', () => {
    expect(roleOf('Shop@Example.test', ' a@b.c , shop@example.test')).toBe('shop')
    expect(roleOf('customer@example.test', 'shop@example.test')).toBe('customer')
    expect(roleOf('shop@example.test', undefined)).toBe('customer')
  })
})
