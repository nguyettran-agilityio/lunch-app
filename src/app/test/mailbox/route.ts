// GET /test/mailbox?email=…: the account emails the test mode sent to that address, newest
// first, as JSON `[{kind, link, tokenHashLink, sentAt}]` (B43). `link` is where the default
// Supabase template's button ends up, /auth/confirm?code=… (CN-71, used until M1-4);
// `tokenHashLink` the link of the repository's templates; a reset link opens
// /auth/reset/link/<sent> (CN-73, CN-74), and its `link` is the same. Test sign-in mode only (B46).
import { desc, eq } from 'drizzle-orm'
import type { NextRequest } from 'next/server'
import { getDb } from '@/server/db/client'
import { testMailbox } from '@/server/auth/test-tables'
import { testRouteClosed } from '../guard'

export async function GET(request: NextRequest) {
  const closed = await testRouteClosed()
  if (closed) return closed
  const email = (request.nextUrl.searchParams.get('email') ?? '').trim().toLowerCase()
  const rows = await getDb().select().from(testMailbox).where(eq(testMailbox.email, email)).orderBy(desc(testMailbox.sentAt))
  return Response.json(
    rows.map((r) => {
      const reset = `/auth/reset/link/${r.sentAt.getTime()}?token_hash=${r.tokenHash}&type=recovery`
      return {
        kind: r.kind,
        link: r.kind === 'recovery' ? reset : `/auth/confirm?code=${r.tokenHash}`,
        tokenHashLink: r.kind === 'recovery' ? reset : `/auth/confirm?token_hash=${r.tokenHash}&type=${r.kind}`,
        sentAt: r.sentAt.toISOString(),
      }
    }),
  )
}
