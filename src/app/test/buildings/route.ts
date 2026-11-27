// /test/buildings?email=…: the buildings proposed by the account of that email (GET, as JSON
// `[{name, state}]`), so a test can check that a proposal created one row or none (AC183,
// AC189, AC192). POST with `{ email, name }` makes a building of that name declined, proposed by
// that account, and its default building, as the shop's decline will from M2 (AC82, AC188).
// Test sign-in mode only (B46).
import { eq } from 'drizzle-orm'
import type { NextRequest } from 'next/server'
import { getDb } from '@/server/db/client'
import { buildings, profiles } from '@/server/db/schema'
import { testRouteClosed } from '../guard'

async function profileOf(email: string) {
  const [p] = await getDb().select({ id: profiles.id }).from(profiles).where(eq(profiles.email, email.trim().toLowerCase()))
  return p ?? null
}

export async function GET(request: NextRequest) {
  const closed = await testRouteClosed()
  if (closed) return closed
  const p = await profileOf(request.nextUrl.searchParams.get('email') ?? '')
  if (!p) return Response.json([])
  const rows = await getDb()
    .select({ name: buildings.name, state: buildings.state, address: buildings.address })
    .from(buildings)
    .where(eq(buildings.proposedBy, p.id))
    .orderBy(buildings.name, buildings.state)
  return Response.json(rows)
}

export async function POST(request: NextRequest) {
  const closed = await testRouteClosed()
  if (closed) return closed
  const { email, name } = (await request.json()) as { email?: string; name?: string }
  const p = email ? await profileOf(email) : null
  if (!p || !name) return new Response('Unknown account', { status: 400 })
  const db = getDb()
  const [b] = await db.insert(buildings).values({ name, state: 'declined', proposedBy: p.id }).returning({ id: buildings.id })
  await db.update(profiles).set({ buildingId: b.id }).where(eq(profiles.id, p.id))
  return Response.json({ id: b.id })
}
