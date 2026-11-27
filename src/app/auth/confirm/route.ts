// GET /auth/confirm: where the link of an account email lands (plan.md section 1.5). Two kinds:
// - the default Supabase template (CN-71, until custom SMTP in M1-4): Supabase checks the link
//   at its /auth/v1/verify, then comes back here with `?code=…` (PKCE), or with `?error=…` /
//   `?error_code=…` when the link has expired or was used;
// - the repository's templates (`supabase/templates/`): `?token_hash=…&type=…`.
// A good link signs this browser in, copies the account's language to the browser (the account
// wins, CN-60) and goes by type: `signup` opens the profile (CN-64); `email_change` makes the new
// email the account's, signs the link's account in on this browser, replacing whoever was signed
// in (CN-77, AC179), and opens the profile with "Your email was changed to …" (the address is
// read there, not put in the URL). Any other answer (expired, used, replaced by a newer change or
// "Send again", cancelled, an error, nothing) opens /auth/expired?type=….
// A reset link lands on /auth/reset/link/<sent> since PR M1-4 (CN-73): `type=recovery` here
// opens the expired page of a reset link. A `?code=` of the default template sent before M1-4
// may be a CN-63 recovery link: a profile that needs a password is signed out at once and sent
// to that expired page, so it never enters the app without a password (CN-73).
import { eq } from 'drizzle-orm'
import { NextResponse, type NextRequest } from 'next/server'
import { confirmEmailChange } from '@/server/auth/accounts'
import { getAuthProvider, type LinkType } from '@/server/auth/provider'
import { getDb } from '@/server/db/client'
import { profiles } from '@/server/db/schema'
import { setLangCookie } from '@/server/session'

const TYPES: LinkType[] = ['signup', 'recovery', 'email_change']

// A relative Location keeps the browser on the host it used, so the cookies set here stay.
const go = (path: string) => new NextResponse(null, { status: 303, headers: { Location: path } })

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const type = TYPES.find((t) => t === params.get('type')) ?? 'signup'
  const expired = `/auth/expired?type=${type}`
  if (type === 'recovery' || params.has('error') || params.has('error_code')) return go(expired)

  const auth = await getAuthProvider()
  const code = params.get('code')
  const tokenHash = params.get('token_hash')
  const verified = code && type === 'signup' ? await auth.exchangeCode(code) : tokenHash ? await auth.verifyLink(tokenHash, type) : null
  if (!verified?.ok) return go(expired)
  if (type === 'email_change') await confirmEmailChange(getDb(), verified.userId, verified.email)
  const [p] = await getDb()
    .select({ lang: profiles.lang, needsPassword: profiles.needsPassword })
    .from(profiles)
    .where(eq(profiles.id, verified.userId))
  if (p?.needsPassword) {
    await auth.signOut()
    return go('/auth/expired?type=recovery')
  }
  if (p) await setLangCookie(p.lang)
  return go(type === 'email_change' ? '/profile?emailChanged=1' : '/profile')
}
