// The session check of the real shop pages (plan.md section 1.5, CN-68, CN-80): someone not signed
// in goes to sign in with the page to return to; a customer goes to /. proxy.ts redirects first;
// the pages check again themselves.
import 'server-only'
import { redirect } from 'next/navigation'
import { getAuthProvider, type SessionUser } from '@/server/auth/provider'

export async function shopUser(path: string): Promise<SessionUser> {
  const user = await (await getAuthProvider()).getUser()
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(path)}`)
  if (user.role !== 'shop') redirect('/')
  return user
}
