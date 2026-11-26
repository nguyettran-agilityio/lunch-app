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
import type { AuthProvider, LinkType } from './provider'
import { roleOf } from './role'

type AuthErrorLike = { code?: string; status?: number; name?: string } | null | undefined

/** Supabase's answer to a limit is HTTP 429 or one of its rate-limit codes (CN-64). */
export function isRateLimited(error: AuthErrorLike): boolean {
  return !!error && (error.status === 429 || error.code === 'over_request_rate_limit' || error.code === 'over_email_send_rate_limit')
}

export function mapSignInError(error: NonNullable<AuthErrorLike>): 'rateLimited' | 'notConfirmed' | 'invalidCredentials' {
  if (isRateLimited(error)) return 'rateLimited'
  if (error.code === 'email_not_confirmed') return 'notConfirmed'
  if (error.code === 'invalid_credentials') return 'invalidCredentials'
  throw new Error(`Supabase sign-in failed: ${error.code ?? error.status ?? 'unknown'}`)
}

function env(
  name: 'NEXT_PUBLIC_SUPABASE_URL' | 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY' | 'SUPABASE_SECRET_KEY' | 'NEXT_PUBLIC_SITE_URL',
): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set (plan.md section 3)`)
  return value
}

/**
 * Where Supabase's default email link comes back after checking it (CN-71): /auth/confirm of
 * this site (NEXT_PUBLIC_SITE_URL, plan.md section 3), which must be in Supabase's Redirect URLs.
 */
function confirmUrl(): string {
  return `${env('NEXT_PUBLIC_SITE_URL').replace(/\/$/, '')}/auth/confirm`
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

/** The secret-key client: never sent to the browser, keeps no session. */
export function adminClient(): SupabaseClient {
  return createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SECRET_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/** Runs one SQL statement on the app's database connection (B62, B63). */
export type RunSql = (query: SQL) => Promise<unknown>

export type SupabaseClients = { session: () => Promise<SupabaseClient>; admin: () => SupabaseClient; runSql: RunSql }

/** The first of `full_name` and `name` of Google's metadata that is not empty once trimmed (CN-72). */
export function metadataName(meta: Record<string, unknown> | undefined): string | null {
  for (const key of ['full_name', 'name']) {
    const v = meta?.[key]
    if (typeof v === 'string' && v.trim()) return v
  }
  return null
}

/** The provider over two clients; tests pass fake ones. */
export function createSupabaseProvider({ session, admin, runSql }: SupabaseClients): AuthProvider {
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
      throw new Error(`Supabase resend failed: ${error.code ?? error.status}`)
    },

    async sendRecovery(email) {
      // The default template's link comes back to /auth/confirm with ?code= (CN-71); the
      // reset page that sets the password comes in M1-4.
      const { error } = await (await session()).auth.resetPasswordForEmail(email, { redirectTo: confirmUrl() })
      if (!error) return { ok: true }
      if (isRateLimited(error)) return { ok: false, error: 'rateLimited' }
      throw new Error(`Supabase recovery failed: ${error.code ?? error.status}`)
    },

    async signInWithPassword(email, password) {
      const { data, error } = await (await session()).auth.signInWithPassword({ email, password })
      if (error) return { ok: false, error: mapSignInError(error) }
      return { ok: true, userId: data.user.id }
    },

    async verifyLink(tokenHash, type: LinkType) {
      const { data, error } = await (await session()).auth.verifyOtp({ token_hash: tokenHash, type })
      // An expired or used link, or one of a deleted account: all open the expired-link page.
      if (error || !data.user) return { ok: false, error: 'invalidLink' }
      return { ok: true, userId: data.user.id }
    },

    async exchangeCode(code) {
      // The code verifier was stored in this browser's cookies at sign-up or "Send again"
      // (PKCE): opened in another browser, the exchange fails and the expired-link page opens.
      const { data, error } = await (await session()).auth.exchangeCodeForSession(code)
      if (error || !data.user) return { ok: false, error: 'invalidLink' }
      return { ok: true, userId: data.user.id }
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
          redirectTo: `${env('NEXT_PUBLIC_SITE_URL').replace(/\/$/, '')}/auth/callback`,
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
