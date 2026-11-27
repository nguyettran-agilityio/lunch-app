// GET /auth/reset/link/<sent>?token_hash=…&type=recovery: where a reset link lands (plan.md
// PR M1-4, CN-73, CN-74, B67). It does not use the link, since opening it must not sign in:
// it keeps the link in the httpOnly `reset_link` cookie and opens /auth/reset, so the token
// leaves the address bar. It answers at once with the expired page when there is no token hash
// (Supabase's default template, which comes back with ?code=, is not used for reset links once
// the repository's templates are pasted), when <sent> is more than 1 hour ago by
// server/clock.ts, or when the link was already saved (`used_reset_links`, AC153). A reset
// session held aside from another link is dropped; one from this same link is kept, so a try
// refused for the old password can go on (AC150).
import { NextResponse, type NextRequest } from 'next/server'
import * as accounts from '@/server/auth/accounts'
import { getAuthProvider } from '@/server/auth/provider'
import { getResetLink, setResetLink } from '@/server/auth/reset-cookies'
import { now } from '@/server/clock'
import { getDb } from '@/server/db/client'

const EXPIRED = '/auth/expired?type=recovery'

// A relative Location keeps the browser on the host it used, so the cookies set here stay.
const go = (path: string) => new NextResponse(null, { status: 303, headers: { Location: path } })

export async function GET(request: NextRequest, ctx: RouteContext<'/auth/reset/link/[sent]'>) {
  const { sent: raw } = await ctx.params
  const tokenHash = request.nextUrl.searchParams.get('token_hash')
  const sent = /^\d+$/.test(raw) ? Number(raw) : NaN
  const { date } = await now()
  const link = tokenHash ? { tokenHash, sent } : null
  if (!link || (await accounts.resetLinkRefusal(getDb(), link, date))) return go(EXPIRED)
  const kept = await getResetLink()
  if (kept && kept.tokenHash !== tokenHash) await (await getAuthProvider()).dropHeldReset()
  await setResetLink(link, date)
  return go('/auth/reset')
}
