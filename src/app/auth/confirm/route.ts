// GET /auth/confirm: where the link of an account email lands (plan.md section 1.5). Two kinds:
// - the default Supabase template (CN-71, until custom SMTP in M1-4): Supabase checks the link
//   at its /auth/v1/verify, then comes back here with `?code=…` (PKCE), or with `?error=…` /
//   `?error_code=…` when the link has expired or was used;
// - the repository's templates (`supabase/templates/`): `?token_hash=…&type=…`.
// A good link signs this browser in, copies the account's language to the browser (the account
// wins, CN-60) and goes by type: `signup` opens the profile (CN-64), which PR M1-5 builds; until
// then the home page /. The other types come in M1-4 (recovery) and M1-5 (email_change). Any
// other answer (expired, used, an error, nothing) opens /auth/expired?type=….
import { eq } from 'drizzle-orm'
import { NextResponse, type NextRequest } from 'next/server'
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
  if (type !== 'signup' || params.has('error') || params.has('error_code')) return go(expired)

  const auth = await getAuthProvider()
  const code = params.get('code')
  const tokenHash = params.get('token_hash')
  const verified = code ? await auth.exchangeCode(code) : tokenHash ? await auth.verifyLink(tokenHash, type) : null
  if (!verified?.ok) return go(expired)
  const [p] = await getDb().select({ lang: profiles.lang }).from(profiles).where(eq(profiles.id, verified.userId))
  if (p) await setLangCookie(p.lang)
  return go('/')
}
