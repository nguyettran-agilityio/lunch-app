// The test sign-in mode (B19, B25, B46). It is on only when all three hold:
// E2E_TEST_AUTH=1, VERCEL_ENV unset, and no Supabase variable set. `next build` fixes
// NODE_ENV to production, so the mode is read at run time from its own variable.
// `instrumentation.ts` refuses to start the server on a conflict, and the /test/* routes
// use the same check, so they answer 404 whenever the mode is not fully on.
// No imports: `instrumentation.ts` and the e2e script load this file as it is.

type Env = Record<string, string | undefined>

// Any of these counts as a Supabase variable, the URL included (B47): the publishable and secret
// keys of B57, and the two legacy key names, so a leftover old key also refuses the test mode.
export const SUPABASE_VARS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SECRET_KEY',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const

// A variable counts as set when it is defined at all, even empty: the stricter reading.
const isSet = (env: Env, name: string) => env[name] !== undefined

// Why the test mode must not run next to this environment, or null when there is no
// conflict. Only E2E_TEST_AUTH=1 can conflict; any other value means the mode is off (B48).
export function testModeConflict(env: Env = process.env): string | null {
  if (env.E2E_TEST_AUTH !== '1') return null
  if (isSet(env, 'VERCEL_ENV')) return 'E2E_TEST_AUTH is set together with VERCEL_ENV'
  const supabase = SUPABASE_VARS.find((name) => isSet(env, name))
  if (supabase) return `E2E_TEST_AUTH is set together with ${supabase}`
  return null
}

// True only when E2E_TEST_AUTH=1, VERCEL_ENV is unset and no Supabase variable is set.
export function isTestMode(env: Env = process.env): boolean {
  return env.E2E_TEST_AUTH === '1' && testModeConflict(env) === null
}
