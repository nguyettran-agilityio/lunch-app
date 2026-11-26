// The two cookies of a Google sign-in (plan.md section 1.5, CN-72), both httpOnly so the page
// script never reads them, and never in a URL:
// - `google_start`: the tab where "Continue with Google" was tapped and the page to return to,
//   set by the Server Action that starts the sign-in, read once by /auth/callback; so Supabase's
//   `redirectTo` stays the plain /auth/callback of its redirect URLs.
// - `google_refused`: the email and the time of an AC91 refusal, for "Send the confirmation
//   link again" (AC134); its age is checked against server/clock.ts, which the test clock moves
//   (B59), so the 1 hour does not depend on the browser's own cookie expiry.
import 'server-only'
import { cookies } from 'next/headers'
import { GOOGLE_REFUSAL_SECONDS } from './accounts'

export type GoogleTab = 'signIn' | 'signUp'
export type GoogleStart = { tab: GoogleTab; next: string | null }

const START = 'google_start'
const REFUSED = 'google_refused'
const base = { httpOnly: true, sameSite: 'lax' as const, path: '/' }

export async function setGoogleStart(start: GoogleStart): Promise<void> {
  // 1 hour, longer than Supabase's code for the sign-in can be used: the tab and `next` are
  // kept whenever the sign-in can still finish (CN-72).
  ;(await cookies()).set(START, JSON.stringify(start), { ...base, maxAge: 60 * 60 })
}

/** The tab and `next` of the sign-in that comes back, or null (another browser, too late). */
export async function takeGoogleStart(): Promise<GoogleStart | null> {
  const jar = await cookies()
  const raw = jar.get(START)?.value
  if (raw) jar.delete(START)
  try {
    const v = raw ? JSON.parse(raw) : null
    if (!v || (v.tab !== 'signIn' && v.tab !== 'signUp')) return null
    return { tab: v.tab, next: typeof v.next === 'string' ? v.next : null }
  } catch {
    return null
  }
}

export async function setGoogleRefused(email: string, at: Date): Promise<void> {
  ;(await cookies()).set(REFUSED, JSON.stringify({ email, at: at.getTime() }), { ...base, maxAge: GOOGLE_REFUSAL_SECONDS })
}

export async function getGoogleRefused(): Promise<{ email: string; at: number } | null> {
  const raw = (await cookies()).get(REFUSED)?.value
  try {
    const v = raw ? JSON.parse(raw) : null
    return v && typeof v.email === 'string' && typeof v.at === 'number' ? { email: v.email, at: v.at } : null
  } catch {
    return null
  }
}
