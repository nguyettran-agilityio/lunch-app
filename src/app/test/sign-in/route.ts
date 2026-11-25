// GET /test/sign-in?account=customer: signs this browser context in as a seeded account
// (B42, B44) and returns its session as JSON. Test sign-in mode only.
import type { NextRequest } from 'next/server'
import { isTestAccountKey } from '@/server/auth/test-accounts'
import { testRouteClosed } from '../guard'

export async function GET(request: NextRequest) {
  const closed = await testRouteClosed()
  if (closed) return closed
  const key = request.nextUrl.searchParams.get('account') ?? ''
  if (!isTestAccountKey(key)) return Response.json({ error: 'unknownAccount' }, { status: 400 })
  const { signInAs } = await import('@/server/auth/test-provider')
  const user = await signInAs(key)
  if (!user) return Response.json({ error: 'notSeeded' }, { status: 400 })
  return Response.json({ email: user.email, role: user.role })
}
