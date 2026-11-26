// Redirects only, never the real check (plan.md sections 1.1 and 1.5, B23, CN-64, CN-65):
// a visitor not signed in who opens a page of the real app goes to /sign-in?next=<path>; a
// signed-in customer who opens a shop page goes to / (CN-68), a shop account that opens a
// customer page goes to /shop (CN-72). The prototype, the account pages and the test routes
// are open to everyone (B55). With Supabase, this is also where the session cookies are
// refreshed. Pages, routes and Server Actions check the session and the role again themselves.
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isOpenPath, roleRedirect } from '@/domain/account'
import { roleOf } from '@/server/auth/role'
import { isTestMode } from '@/server/auth/test-mode'

export { isOpenPath }

/** Where a visitor not signed in is sent: the sign-in page, with the page to return to. */
export function signInRedirect(request: NextRequest): URL {
  // A clone of nextUrl keeps the host the browser used.
  const url = request.nextUrl.clone()
  const { pathname, search } = request.nextUrl
  url.pathname = '/sign-in'
  url.search = ''
  if (pathname !== '/') url.searchParams.set('next', `${pathname}${search}`)
  else if (search) url.searchParams.set('next', `/${search}`)
  return url
}

type Session = { ok: boolean; email: string | null; response: NextResponse }

// The email of the test session's account, or null; a failed lookup only skips the role
// redirect, the page checks again.
async function testSessionEmail(token: string): Promise<string | null> {
  try {
    const [{ getDb }, { profiles }, { testSessions }, { eq }] = await Promise.all([
      import('@/server/db/client'),
      import('@/server/db/schema'),
      import('@/server/auth/test-tables'),
      import('drizzle-orm'),
    ])
    const [row] = await getDb()
      .select({ email: profiles.email })
      .from(testSessions)
      .innerJoin(profiles, eq(profiles.id, testSessions.userId))
      .where(eq(testSessions.token, token))
    return row?.email ?? null
  } catch {
    return null
  }
}

// Whether a session is there, its email, and the response that carries any refreshed cookies.
async function session(request: NextRequest): Promise<Session> {
  let response = NextResponse.next({ request })
  if (isTestMode()) {
    // The test version keeps its session token in this cookie (test-provider.ts).
    const token = request.cookies.get('test_session')?.value
    return { ok: !!token, email: token && !isOpenPath(request.nextUrl.pathname) ? await testSessionEmail(token) : null, response }
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) return { ok: false, email: null, response }
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(list) {
        for (const c of list) request.cookies.set(c.name, c.value)
        response = NextResponse.next({ request })
        for (const c of list) response.cookies.set(c.name, c.value, c.options)
      },
    },
  })
  const { data } = await supabase.auth.getClaims()
  const email = typeof data?.claims?.email === 'string' ? data.claims.email : null
  return { ok: !!data?.claims, email, response }
}

export async function proxy(request: NextRequest) {
  const { ok, email, response } = await session(request)
  const path = request.nextUrl.pathname
  if (!ok) return isOpenPath(path) ? response : NextResponse.redirect(signInRedirect(request))
  const to = email ? roleRedirect(path, roleOf(email)) : null
  if (!to) return response
  const url = request.nextUrl.clone()
  url.pathname = to
  url.search = ''
  const redirect = NextResponse.redirect(url)
  // Keep any session cookies Supabase refreshed on this request.
  for (const c of response.cookies.getAll()) redirect.cookies.set(c)
  return redirect
}

export const config = {
  // Everything but Next's own files and files with an extension (favicon, images).
  matcher: ['/((?!_next/static|_next/image|.*\\.[a-zA-Z0-9]+$).*)'],
}
