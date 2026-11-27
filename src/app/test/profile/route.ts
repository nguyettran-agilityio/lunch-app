// GET /test/profile?email=…: the profile of that email as JSON, or null, so a test can check
// that saving a new password leaves the profile unchanged (AC94, AC146). Test sign-in mode only (B46).
import { eq, or } from 'drizzle-orm'
import type { NextRequest } from 'next/server'
import { getDb } from '@/server/db/client'
import { profiles } from '@/server/db/schema'
import { testRouteClosed } from '../guard'

export async function GET(request: NextRequest) {
  const closed = await testRouteClosed()
  if (closed) return closed
  const email = (request.nextUrl.searchParams.get('email') ?? '').trim().toLowerCase()
  const [p] = await getDb()
    .select({
      phone: profiles.phone,
      name: profiles.name,
      lang: profiles.lang,
      buildingId: profiles.buildingId,
      method: profiles.method,
      needsPassword: profiles.needsPassword,
      email: profiles.email,
      pendingEmail: profiles.pendingEmail,
    })
    .from(profiles)
    // By the account's email, or by its waiting new email (M1-5).
    .where(or(eq(profiles.email, email), eq(profiles.pendingEmail, email)))
  return Response.json(p ?? null)
}
