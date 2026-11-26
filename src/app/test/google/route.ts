// GET /test/google: the test sign-in mode's stand-in for Google's page (plan.md section 4,
// B25). "Continue with Google" lands here; the test says beforehand, in a `test_google` cookie
// of its browser context, which Google email and name to answer with, what the sign-in service
// does when that email is already a user's (`outcome`), or that the visitor cancels (`error`).
// It then goes on to /auth/callback as Google would. Test sign-in mode only (B46).
import type { NextRequest } from 'next/server'
import { testRouteClosed } from '../guard'

export async function GET(request: NextRequest) {
  const closed = await testRouteClosed()
  if (closed) return closed
  const { testGoogleAnswer } = await import('@/server/auth/test-provider')
  let ask = null
  try {
    ask = JSON.parse(decodeURIComponent(request.cookies.get('test_google')?.value ?? 'null'))
  } catch {}
  return new Response(null, { status: 303, headers: { Location: await testGoogleAnswer(ask) } })
}
