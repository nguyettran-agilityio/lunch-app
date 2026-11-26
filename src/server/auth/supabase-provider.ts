// The Supabase version of the AuthProvider (B4, B16, B25, B57). The session lives in cookies
// through `@supabase/ssr` with the publishable key; reading or deleting auth users uses the
// secret key, server only. Supabase "Confirm email" is on (plan.md section 3), so a sign-up
// gets no session until its link is tapped. Errors are mapped to the interface's codes by
// `mapAuthError`, tested with a fake client (plan.md section 4).
import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
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

export type SupabaseClients = { session: () => Promise<SupabaseClient>; admin: () => SupabaseClient }

/** The provider over two clients; tests pass fake ones. */
export function createSupabaseProvider({ session, admin }: SupabaseClients): AuthProvider {
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
  }
}

export function supabaseAuthProvider(): AuthProvider {
  return createSupabaseProvider({ session: sessionClient, admin: adminClient })
}
