// The AuthProvider interface (B25): one interface with a Supabase version
// (`supabase-provider.ts`) and a test version (`test-provider.ts`). Pages, routes and Server
// Actions reach the sign-in service only through it; each later PR extends both versions.
// The rules (which message, when to replace a waiting account, the 60-second wait) are not
// here: they are in `accounts.ts`, the same for both versions.
import 'server-only'
import type { Role } from './role'
import { isTestMode } from './test-mode'

export type SessionUser = { id: string; email: string; role: Role }

/** The kind of a link in an account email (the `type` of /auth/confirm). */
export type LinkType = 'signup' | 'recovery' | 'email_change'

export type Result<T, E extends string> = ({ ok: true } & T) | { ok: false; error: E }

export interface AuthProvider {
  /** The account signed in on this request, or null. */
  getUser(): Promise<SessionUser | null>
  /** Ends the session of this browser. */
  signOut(): Promise<void>
  /** Creates an unconfirmed account and sends its confirmation email at once. */
  signUp(email: string, password: string): Promise<Result<{ userId: string }, 'rateLimited' | 'emailTaken'>>
  /** Sends a new confirmation link to an unconfirmed account; older links stop working. */
  resendConfirmation(email: string): Promise<Result<object, 'rateLimited'>>
  /** Signs this browser in. The password is checked before the confirmation. */
  signInWithPassword(
    email: string,
    password: string,
  ): Promise<Result<{ userId: string }, 'invalidCredentials' | 'notConfirmed' | 'rateLimited'>>
  /** Uses a link once: confirms the email (for `signup`) and signs this browser in. */
  verifyLink(tokenHash: string, type: LinkType): Promise<Result<{ userId: string }, 'invalidLink'>>
  /** Whether the email of this auth user is confirmed. */
  isConfirmed(userId: string): Promise<boolean>
  /** Deletes an auth user (a replaced waiting account, CN-62); its links stop working. */
  deleteUser(userId: string): Promise<void>
}

export async function getAuthProvider(): Promise<AuthProvider> {
  if (isTestMode()) return (await import('./test-provider')).testAuthProvider
  return (await import('./supabase-provider')).supabaseAuthProvider()
}
