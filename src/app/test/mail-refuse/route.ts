// GET /test/mail-refuse?email=…: from now on the test mode refuses to send any account email
// to that address, as Resend with no domain does for every address but its owner's (CN-74,
// B65, AC156). Test sign-in mode only (B46).
import type { NextRequest } from 'next/server'
import { getDb } from '@/server/db/client'
import { testMailRefuse } from '@/server/auth/test-tables'
import { testRouteClosed } from '../guard'

export async function GET(request: NextRequest) {
  const closed = await testRouteClosed()
  if (closed) return closed
  const email = (request.nextUrl.searchParams.get('email') ?? '').trim().toLowerCase()
  if (!email) return Response.json({ error: 'noEmail' }, { status: 400 })
  await getDb().insert(testMailRefuse).values({ email }).onConflictDoNothing()
  return Response.json({ refused: email })
}
