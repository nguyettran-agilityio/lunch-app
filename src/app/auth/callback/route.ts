// GET /auth/callback: where Google (through Supabase, or the test sign-in mode's stand-in)
// comes back after "Continue with Google" (plan.md section 1.5, CN-62, CN-63, CN-65, CN-72).
// - Any `error` parameter counts as Google's error (cancelled, permission refused): back to
//   the tab where Google was tapped, keeping `next`, with "Could not sign in with Google,
//   please try again" under the Google button (AC130, AC133).
// - No code, or a code that does not sign in (finished in another browser, used twice): the
//   same message on /sign-in, with `next` when this browser still has it (AC133).
// - A refusal of the linking guard or of a waiting email: back to that tab, keeping `next`,
//   with its message (AC49, AC91, AC110, AC128, AC132); for AC91 the email is kept in a cookie
//   for "Send the confirmation link again", never in the URL (AC134).
// - Signed in: the account's language to the browser (the account wins, CN-60), then where
//   signing in goes (CN-65, CN-69, CN-72).
// The URL carries only the code of the message, no email.
import { eq } from 'drizzle-orm'
import { NextResponse, type NextRequest } from 'next/server'
import { afterSignIn, googleRefusalPath as refusalPath, isProfileComplete } from '@/domain/account'
import * as accounts from '@/server/auth/accounts'
import { setGoogleRefused, takeGoogleStart } from '@/server/auth/google-cookies'
import { getAuthProvider } from '@/server/auth/provider'
import { roleOf } from '@/server/auth/role'
import { now } from '@/server/clock'
import { getDb } from '@/server/db/client'
import { buildings } from '@/server/db/schema'
import { getLang, setLangCookie } from '@/server/session'

// A relative Location keeps the browser on the host it used, so the cookies set here stay.
const go = (path: string) => new NextResponse(null, { status: 303, headers: { Location: path } })

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const start = await takeGoogleStart()
  if (params.has('error') || params.has('error_code')) return go(refusalPath(start, 'googleFailed'))

  const code = params.get('code')
  const { date } = await now()
  const result = await accounts.googleSignIn({ db: getDb(), auth: await getAuthProvider(), at: date }, code, await getLang())
  if (result.status === 'refused') {
    // A failure that is not Google's error goes to /sign-in, keeping `next` (CN-72).
    if (result.code === 'googleFailed') return go(refusalPath(start && { tab: 'signIn', next: start.next }, 'googleFailed'))
    if (result.code === 'googleNotConfirmed' && result.email) await setGoogleRefused(result.email, date)
    return go(refusalPath(start, result.code))
  }

  const p = result.profile
  await setLangCookie(p.lang)
  const [b] = p.buildingId ? await getDb().select({ state: buildings.state }).from(buildings).where(eq(buildings.id, p.buildingId)) : []
  const complete = isProfileComplete({ name: p.name, phone: p.phone, buildingState: b?.state ?? null })
  return go(afterSignIn({ role: roleOf(p.email), complete, next: start?.next }))
}
