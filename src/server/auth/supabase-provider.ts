// The Supabase version of the AuthProvider (B4, B16, B25, B57). The session lives in cookies
// through `@supabase/ssr` with the publishable key; reading or deleting auth users uses the
// secret key, server only. Supabase "Confirm email" is on (plan.md section 3), so a sign-up
// gets no session until its link is tapped. Errors are mapped to the interface's codes by
// `mapAuthError`, tested with a fake client (plan.md section 4).
import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { sql, type SQL } from 'drizzle-orm'
import { cookies } from 'next/headers'
import { getDb } from '@/server/db/client'
import { siteUrl } from '@/server/site-url'
import type { AuthProvider, LinkType } from './provider'
import { RESET_COOKIE_PATH, getResetLink, resetCookieExpiry } from './reset-cookies'
import { roleOf } from './role'

type AuthErrorLike = { code?: string; status?: number; name?: string } | null | undefined

/** Supabase's answer to a limit is HTTP 429 or one of its rate-limit codes (CN-64). */
export function isRateLimited(error: AuthErrorLike): boolean {
  return !!error && (error.status === 429 || error.code === 'over_request_rate_limit' || error.code === 'over_email_send_rate_limit')
}

/**
 * Supabase could not send an account email for a reason other than its limit: an HTTP 5xx
 * answer, for example Resend refusing an address while it has no domain (CN-74, B67).
 */
export function isSendFailure(error: AuthErrorLike): boolean {
  return !!error && !isRateLimited(error) && typeof error.status === 'number' && error.status >= 500
}

export function mapSignInError(error: NonNullable<AuthErrorLike>): 'rateLimited' | 'notConfirmed' | 'invalidCredentials' {
  if (isRateLimited(error)) return 'rateLimited'
  if (error.code === 'email_not_confirmed') return 'notConfirmed'
  if (error.code === 'invalid_credentials') return 'invalidCredentials'
  throw new Error(`Supabase sign-in failed: ${error.code ?? error.status ?? 'unknown'}`)
}

function env(name: 'NEXT_PUBLIC_SUPABASE_URL' | 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY' | 'SUPABASE_SECRET_KEY'): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set (plan.md section 3)`)
  return value
}

/**
 * /auth/confirm of this site (`siteUrl`, B64), which must match Supabase's Redirect URLs. Supabase's
 * default email link comes back there after checking it (CN-71), and the repo's templates build
 * their link from it as `{{ .RedirectTo }}` (B64).
 */
function confirmUrl(): string {
  return `${siteUrl()}/auth/confirm`
}

/**
 * Where a reset link lands (CN-73, CN-74, B67): /auth/reset/link/<sent>, the time of sending
 * that the app logs; the repository's template adds `?token_hash=…&type=recovery`.
 */
export function resetLinkUrl(at: Date): string {
  return `${siteUrl()}/auth/reset/link/${at.getTime()}`
}

/** The browser's session client of this request (Server Components, Actions, Route Handlers). */
export async function sessionClient(): Promise<SupabaseClient> {
  const jar = await cookies()
  return createServerClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'), {
    cookies: {
      getAll: () => jar.getAll(),
      setAll(list) {
        // A Server Component cannot set cookies; proxy.ts refreshes the session there.
        try {
          for (const c of list) jar.set(c.name, c.value, c.options)
        } catch {}
      },
    },
  })
}

/** The name of the cookies of the reset session held aside (CN-73, B67). */
export const RESET_SESSION_COOKIE = 'sb-reset'

/**
 * A second session client whose session lives in its own `sb-reset` cookies, on path /auth and
 * expiring with the `reset_link` cookie: the session a reset link creates is held there, so
 * nothing of the app counts it as signed in until the new password is saved (CN-73).
 */
export async function resetClient(): Promise<SupabaseClient> {
  const jar = await cookies()
  const link = await getResetLink()
  const expires = link ? resetCookieExpiry(link.sent, new Date()) : new Date(Date.now() + 60 * 60 * 1000)
  return createServerClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'), {
    cookieOptions: { name: RESET_SESSION_COOKIE },
    cookies: {
      getAll: () => jar.getAll().filter((c) => c.name.startsWith(RESET_SESSION_COOKIE)),
      setAll(list) {
        for (const c of list) {
          // Not the 400 days of @supabase/ssr: the hour of the link, and only the reset pages.
          const { maxAge, ...options } = c.options
          jar.set(c.name, c.value, { ...options, path: RESET_COOKIE_PATH, ...(maxAge === 0 ? { maxAge: 0 } : { expires }) })
        }
      },
    },
  })
}

/** Deletes the `sb-reset` cookies, on their own path (B67). */
export async function dropResetCookies(): Promise<void> {
  const jar = await cookies()
  for (const c of jar.getAll()) if (c.name.startsWith(RESET_SESSION_COOKIE)) jar.delete({ name: c.name, path: RESET_COOKIE_PATH })
}

/** Rows of `runSql`: postgres-js returns an array, PGlite an object with `rows`. */
function rowsOf(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[]
  const rows = (result as { rows?: unknown } | null)?.rows
  return Array.isArray(rows) ? (rows as Record<string, unknown>[]) : []
}

/** The secret-key client: never sent to the browser, keeps no session. */
export function adminClient(): SupabaseClient {
  return createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SECRET_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/** Runs one SQL statement on the app's database connection (B62, B63). */
export type RunSql = (query: SQL) => Promise<unknown>

export type SupabaseClients = {
  session: () => Promise<SupabaseClient>
  admin: () => SupabaseClient
  runSql: RunSql
  /** The client of the reset session held aside, and how its cookies are deleted (B67). */
  reset?: () => Promise<SupabaseClient>
  dropReset?: () => Promise<void>
}

/** The first of `full_name` and `name` of Google's metadata that is not empty once trimmed (CN-72). */
export function metadataName(meta: Record<string, unknown> | undefined): string | null {
  for (const key of ['full_name', 'name']) {
    const v = meta?.[key]
    if (typeof v === 'string' && v.trim()) return v
  }
  return null
}

/** The provider over two clients; tests pass fake ones. */
export function createSupabaseProvider({
  session,
  admin,
  runSql,
  reset = resetClient,
  dropReset = dropResetCookies,
}: SupabaseClients): AuthProvider {
  // B68: a held reset session that is dropped is first signed out at Supabase, then its cookies go.
  const dropHeld = async () => {
    const client = await reset()
    if ((await client.auth.getSession()).data.session) await client.auth.signOut({ scope: 'local' }).catch(() => undefined)
    await dropReset()
  }
  return {
    async getUser() {
      const { data } = await (await session()).auth.getUser()
      const email = data.user?.email
      return data.user && email ? { id: data.user.id, email, role: roleOf(email) } : null
    },

    async signOut() {
      // This device only: the customer stays signed in elsewhere until they sign out there (CN-64).
      await (await session()).auth.signOut({ scope: 'local' })
    },

    async signUp(email, password) {
      const { data, error } = await (await session()).auth.signUp({ email, password, options: { emailRedirectTo: confirmUrl() } })
      if (error) {
        if (isRateLimited(error)) return { ok: false, error: 'rateLimited' }
        if (error.code === 'user_already_exists' || error.code === 'email_exists') return { ok: false, error: 'emailTaken' }
        if (isSendFailure(error)) return { ok: false, error: 'sendFailed' }
        throw new Error(`Supabase sign-up failed: ${error.code ?? error.status}`)
      }
      // An existing confirmed email comes back as a user with no identity (Supabase hides it).
      if (!data.user || data.user.identities?.length === 0) return { ok: false, error: 'emailTaken' }
      return { ok: true, userId: data.user.id }
    },

    async resendConfirmation(email) {
      const { error } = await (await session()).auth.resend({ type: 'signup', email, options: { emailRedirectTo: confirmUrl() } })
      if (!error) return { ok: true }
      if (isRateLimited(error)) return { ok: false, error: 'rateLimited' }
      if (isSendFailure(error)) return { ok: false, error: 'sendFailed' }
      throw new Error(`Supabase resend failed: ${error.code ?? error.status}`)
    },

    async sendRecovery(email, at) {
      // The repository's template opens /auth/reset/link/<sent>?token_hash=…&type=recovery
      // (CN-73, CN-74); the link is used only when the new password is saved.
      const { error } = await (await session()).auth.resetPasswordForEmail(email, { redirectTo: resetLinkUrl(at) })
      if (!error) return { ok: true }
      if (isRateLimited(error)) return { ok: false, error: 'rateLimited' }
      if (isSendFailure(error)) return { ok: false, error: 'sendFailed' }
      throw new Error(`Supabase recovery failed: ${error.code ?? error.status}`)
    },

    async heldResetUser() {
      const client = await reset()
      const { data } = await client.auth.getSession()
      if (!data.session) return null
      const { data: u, error } = await client.auth.getUser()
      return !error && u.user?.email ? { id: u.user.id, email: u.user.email } : null
    },

    async resetPassword(link, password) {
      const client = await reset()
      // Every error but the limit and the same password means the link, or the session held
      // from it, can no longer be used: the expired page (CN-74, AC153).
      const failed = async (error: AuthErrorLike) => {
        if (isRateLimited(error)) return { ok: false as const, error: 'rateLimited' as const }
        await dropHeld()
        return { ok: false as const, error: 'invalidLink' as const }
      }
      if (!(await client.auth.getSession()).data.session) {
        const { data, error } = await client.auth.verifyOtp({ token_hash: link.tokenHash, type: 'recovery' })
        if (error || !data.session) return failed(error)
      }
      const { data: updated, error } = await client.auth.updateUser({ password })
      // Kept: the next try needs no new link (AC150).
      if (error?.code === 'same_password') return { ok: false, error: 'samePassword' }
      if (error || !updated.user) return failed(error)
      // Every other device of the account (CN-64, AC100).
      await client.auth.signOut({ scope: 'others' })
      const held = (await client.auth.getSession()).data.session
      if (!held) return failed(null)
      // Another account signed in on this device is signed out for good (CN-74, AC157).
      const main = await session()
      if ((await main.auth.getSession()).data.session) await main.auth.signOut({ scope: 'local' }).catch(() => undefined)
      const { error: setError } = await main.auth.setSession({ access_token: held.access_token, refresh_token: held.refresh_token })
      // Only the cookies: the held session is now this browser's own.
      await dropReset()
      if (setError) throw new Error(`Supabase set session failed: ${setError.code ?? setError.status}`)
      return { ok: true, userId: updated.user.id }
    },

    dropHeldReset: dropHeld,

    async hasPassword(userId) {
      // B66: Supabase may keep '' for a user with no password, so both NULL and '' mean none.
      const rows = rowsOf(
        await runSql(sql`SELECT (encrypted_password IS NOT NULL AND encrypted_password <> '') AS has FROM auth.users WHERE id = ${userId}`),
      )
      return rows[0]?.has === true
    },

    async signInWithPassword(email, password) {
      const { data, error } = await (await session()).auth.signInWithPassword({ email, password })
      if (error) return { ok: false, error: mapSignInError(error) }
      return { ok: true, userId: data.user.id }
    },

    async verifyLink(tokenHash, type: LinkType) {
      // The app's own session client: the link's session replaces whoever was signed in on this
      // browser, also for an email-change link (CN-77, AC179).
      const { data, error } = await (await session()).auth.verifyOtp({ token_hash: tokenHash, type })
      // An expired or used link, or one of a deleted account: all open the expired-link page.
      if (error || !data.user) return { ok: false, error: 'invalidLink' }
      return { ok: true, userId: data.user.id, email: data.user.email ?? '' }
    },

    async exchangeCode(code) {
      // The code verifier was stored in this browser's cookies at sign-up or "Send again"
      // (PKCE): opened in another browser, the exchange fails and the expired-link page opens.
      const { data, error } = await (await session()).auth.exchangeCodeForSession(code)
      if (error || !data.user) return { ok: false, error: 'invalidLink' }
      return { ok: true, userId: data.user.id, email: data.user.email ?? '' }
    },

    async changeEmail(_userId, email) {
      // "Secure email change" is off (plan.md section 3): only the new address gets a link, and
      // the repository's template builds it from `{{ .RedirectTo }}` (B64). A new call replaces
      // the change waiting and its token, so its older links stop working (AC174, AC186).
      const { error } = await (await session()).auth.updateUser({ email }, { emailRedirectTo: confirmUrl() })
      if (!error) return { ok: true }
      if (isRateLimited(error)) return { ok: false, error: 'rateLimited' }
      if (error.code === 'email_exists' || error.code === 'user_already_exists') return { ok: false, error: 'emailTaken' }
      if (isSendFailure(error)) return { ok: false, error: 'sendFailed' }
      throw new Error(`Supabase email change failed: ${error.code ?? error.status}`)
    },

    async cancelEmailChange(userId) {
      // B70: Supabase has no call to take back a waiting email change, so the app clears it on
      // auth.users through DATABASE_URL, as B62 does for an identity, and deletes its one-time
      // tokens, by which Supabase finds the link.
      await runSql(
        sql`UPDATE auth.users SET email_change = '', email_change_token_new = '', email_change_token_current = '', email_change_confirm_status = 0, email_change_sent_at = NULL WHERE id = ${userId}`,
      )
      await runSql(
        sql`DELETE FROM auth.one_time_tokens WHERE user_id = ${userId} AND token_type IN ('email_change_token_new', 'email_change_token_current')`,
      )
    },

    async isConfirmed(userId) {
      const { data, error } = await admin().auth.admin.getUserById(userId)
      // No auth user any more: nothing confirmed. Any other error ends the action, so a
      // confirmed account is never taken for a waiting one and replaced (BR-29a, CN-67).
      if (error && error.status === 404) return false
      if (error) throw new Error(`Supabase get user failed: ${error.code ?? error.status}`)
      return !!data.user?.email_confirmed_at
    },

    async deleteUser(userId) {
      const { error } = await admin().auth.admin.deleteUser(userId)
      if (error && error.status !== 404) throw new Error(`Supabase delete user failed: ${error.code ?? error.status}`)
    },

    async googleSignInUrl() {
      // PKCE: the code verifier goes into this browser's cookies; the callback needs it.
      // CN-72: Google always shows its account chooser, since office computers can be shared.
      const { data, error } = await (
        await session()
      ).auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${siteUrl()}/auth/callback`,
          skipBrowserRedirect: true,
          queryParams: { prompt: 'select_account' },
        },
      })
      if (error || !data.url) throw new Error(`Supabase Google sign-in failed: ${error?.code ?? error?.status ?? 'no url'}`)
      return data.url
    },

    async exchangeGoogleCode(code) {
      // Finished in another browser (no verifier), used twice, or expired: not signed in.
      const { data, error } = await (await session()).auth.exchangeCodeForSession(code)
      const user = data?.user
      if (error || !user?.email) return { ok: false, error: 'failed' }
      const identities = (user.identities ?? []).map((i) => ({
        provider: i.provider === 'google' ? ('google' as const) : ('email' as const),
        verified: i.identity_data?.email_verified === true,
      }))
      return { ok: true, user: { id: user.id, email: user.email, name: metadataName(user.user_metadata), identities } }
    },

    async removeGoogleIdentity(userId, { unconfirm }) {
      // B62: the identity row itself, with "Enable Manual Linking" off; B63: the confirmation
      // time that the Google sign-in set on a waiting account.
      await runSql(sql`DELETE FROM auth.identities WHERE user_id = ${userId} AND provider = 'google'`)
      if (unconfirm) await runSql(sql`UPDATE auth.users SET email_confirmed_at = NULL WHERE id = ${userId}`)
    },
  }
}

export function supabaseAuthProvider(): AuthProvider {
  return createSupabaseProvider({ session: sessionClient, admin: adminClient, runSql: (q) => getDb().execute(q) })
}
