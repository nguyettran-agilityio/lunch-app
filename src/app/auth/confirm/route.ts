// GET /auth/confirm?token_hash=…&type=…: the link of an account email (plan.md section 1.5,
// BR-29c). It verifies the token, which signs this browser in, copies the account's language
// to the browser (the account wins, CN-60), then goes by type. `signup` opens the profile
// (CN-64), which PR M1-5 builds; until then the home page /. The other types come in M1-4
// (recovery) and M1-5 (email_change). An expired or used link opens /auth/expired?type=….
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
  const tokenHash = params.get('token_hash') ?? ''
  const expired = `/auth/expired?type=${type}`
  if (!tokenHash || type !== 'signup') return go(expired)

  const verified = await (await getAuthProvider()).verifyLink(tokenHash, type)
  if (!verified.ok) return go(expired)
  const [p] = await getDb().select({ lang: profiles.lang }).from(profiles).where(eq(profiles.id, verified.userId))
  if (p) await setLangCookie(p.lang)
  return go('/')
}
