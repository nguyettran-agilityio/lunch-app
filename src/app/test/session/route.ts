// GET /test/session: the account signed in on this browser context as JSON
// `{email, role}`, or `null` (B42). Test sign-in mode only.
import { getAuthProvider } from '@/server/auth/provider'
import { testRouteClosed } from '../guard'

export async function GET() {
  const closed = await testRouteClosed()
  if (closed) return closed
  const user = await (await getAuthProvider()).getUser()
  return Response.json(user && { email: user.email, role: user.role })
}
