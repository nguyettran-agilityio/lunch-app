// The AuthProvider interface (B25): one interface with a Supabase version (from PR M1-2)
// and a test version (`test-provider.ts`). Pages, routes and Server Actions read the
// session only through it; each later PR extends both versions.
import 'server-only'
import type { Role } from './role'
import { isTestMode } from './test-mode'

export type SessionUser = { id: string; email: string; role: Role }

export interface AuthProvider {
  /** The account signed in on this request, or null. */
  getUser(): Promise<SessionUser | null>
  /** Ends the session of this browser. */
  signOut(): Promise<void>
}

export async function getAuthProvider(): Promise<AuthProvider> {
  if (isTestMode()) return (await import('./test-provider')).testAuthProvider
  // Until then, outside the test mode, getting the provider throws (B47).
  throw new Error('The Supabase AuthProvider arrives in PR M1-2')
}
