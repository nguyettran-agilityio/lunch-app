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

/**
 * The auth user that a Google sign-in signed in (plan.md section 1.5): its identities, with
 * whether its email identity was verified (Supabase's `identity_data.email_verified`), so the
 * linking guard can tell a confirmed phone + password account from a waiting one (CN-62).
 */
export type GoogleUser = {
  id: string
  email: string
  /** Google's name: the first of `full_name` and `name` not empty once trimmed, else null. */
  name: string | null
  identities: { provider: 'email' | 'google'; verified: boolean }[]
}

/** The reset link kept by /auth/reset/link/<sent> until the new password is saved (CN-73). */
export type ResetLink = { tokenHash: string; sent: number }

export interface AuthProvider {
  /** The account signed in on this request, or null. */
  getUser(): Promise<SessionUser | null>
  /** Ends the session of this browser. */
  signOut(): Promise<void>
  /**
   * Creates an unconfirmed account and sends its confirmation email at once. `sendFailed`: the
   * service could not send the email (CN-74), and keeps no user.
   */
  signUp(email: string, password: string): Promise<Result<{ userId: string }, 'rateLimited' | 'emailTaken' | 'sendFailed'>>
  /**
   * Sends the reset link: for "Forgot password", and the link that confirms the email and sets
   * the password again for an account whose password the sign-in service removed at a Google
   * sign-in (CN-63, CN-72, AC136). `at` is the time of sending that the app logs, carried in the
   * link's address (`/auth/reset/link/<sent>`, CN-74).
   */
  sendRecovery(email: string, at: Date): Promise<Result<object, 'rateLimited' | 'sendFailed'>>
  /** Sends a new confirmation link to an unconfirmed account; older links stop working. */
  resendConfirmation(email: string): Promise<Result<object, 'rateLimited' | 'sendFailed'>>
  /**
   * The account of the reset session held aside by an earlier try of this browser (a save
   * refused for the old password), or null (CN-73, CN-74).
   */
  heldResetUser(): Promise<{ id: string; email: string } | null>
  /**
   * Saves a new password from a reset link (CN-73, CN-74): uses the link (or the session held
   * aside from an earlier try) on a session of its own that the app does not count as signed
   * in; `samePassword` keeps that session for the next try. On success it signs out the
   * account's other devices (CN-64), ends any other session of this browser, then signs this
   * browser in as the link's account.
   */
  resetPassword(link: ResetLink, password: string): Promise<Result<{ userId: string }, 'invalidLink' | 'samePassword' | 'rateLimited'>>
  /** Ends the reset session held aside, if any, and deletes its cookies (B68). */
  dropHeldReset(): Promise<void>
  /** Whether the auth user has a password (B66). */
  hasPassword(userId: string): Promise<boolean>
  /** Signs this browser in. The password is checked before the confirmation. */
  signInWithPassword(
    email: string,
    password: string,
  ): Promise<Result<{ userId: string }, 'invalidCredentials' | 'notConfirmed' | 'rateLimited'>>
  /**
   * Uses a link once: confirms the email (for `signup`), or makes the new email the account's
   * (for `email_change`), and signs this browser in as the link's account, replacing whoever was
   * signed in on it (CN-77, AC179). `email` is the account's email after the link.
   */
  verifyLink(tokenHash: string, type: LinkType): Promise<Result<{ userId: string; email: string }, 'invalidLink'>>
  /**
   * Sends the link that confirms a new email to that address only ("Secure email change" off,
   * plan.md section 3), for the account signed in (`userId`). A new change, also to the same
   * address ("Send again"), replaces the one waiting: its older links stop working (CN-77,
   * CN-78, AC174, AC186). `emailTaken`: the service already has an account with that email.
   */
  changeEmail(userId: string, email: string, at: Date): Promise<Result<object, 'rateLimited' | 'sendFailed' | 'emailTaken'>>
  /**
   * Takes back the email change waiting on the auth user, so its link stops working (CN-77,
   * AC175); through `DATABASE_URL` in the Supabase version, which has no call for it (B70).
   */
  cancelEmailChange(userId: string): Promise<void>
  /**
   * The link of Supabase's default template (CN-71): Supabase checks it and comes back to
   * /auth/confirm with `?code=`; the code, used once, signs this browser in.
   */
  exchangeCode(code: string): Promise<Result<{ userId: string; email: string }, 'invalidLink'>>
  /** Whether the email of this auth user is confirmed. */
  isConfirmed(userId: string): Promise<boolean>
  /** Deletes an auth user (a replaced waiting account, CN-62); its links stop working. */
  deleteUser(userId: string): Promise<void>
  /**
   * Where the browser goes to sign in with Google; its callback is /auth/callback. Called from
   * a Server Action, which may set cookies (Supabase keeps the PKCE verifier there).
   */
  googleSignInUrl(): Promise<string>
  /** Uses the code of /auth/callback once: signs this browser in as the Google user. */
  exchangeGoogleCode(code: string): Promise<Result<{ user: GoogleUser }, 'failed'>>
  /**
   * Takes off the Google identity that Supabase linked to an existing account (B62) and, with
   * `unconfirm`, clears the email confirmation time that Google set on a waiting account (B63).
   */
  removeGoogleIdentity(userId: string, options: { unconfirm: boolean }): Promise<void>
}

export async function getAuthProvider(): Promise<AuthProvider> {
  if (isTestMode()) return (await import('./test-provider')).testAuthProvider
  return (await import('./supabase-provider')).supabaseAuthProvider()
}
