// Redirects only, never the real check (plan.md sections 1.1 and 1.5, B23, CN-64, CN-65):
// a visitor not signed in who opens a page of the real app goes to /sign-in?next=<path>.
// The prototype, the account pages and the test routes are open to everyone (B55). With
// Supabase, this is also where the session cookies are refreshed. Pages, routes and Server
// Actions check the session again themselves. M1-3 adds the shop/customer redirects.
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isTestMode } from '@/server/auth/test-mode'

const OPEN = ['/proto', '/sign-in', '/sign-up', '/forgot-password', '/auth', '/test']

export function isOpenPath(path: string): boolean {
  return OPEN.some((p) => path === p || path.startsWith(`${p}/`))
}

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

// Whether a session is there, and the response that carries any refreshed session cookies.
async function session(request: NextRequest): Promise<{ ok: boolean; response: NextResponse }> {
  let response = NextResponse.next({ request })
  // The test version keeps its session token in this cookie (test-provider.ts).
  if (isTestMode()) return { ok: request.cookies.has('test_session'), response }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) return { ok: false, response }
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
  return { ok: !!data?.claims, response }
}

export async function proxy(request: NextRequest) {
  const { ok, response } = await session(request)
  if (ok || isOpenPath(request.nextUrl.pathname)) return response
  return NextResponse.redirect(signInRedirect(request))
}

export const config = {
  // Everything but Next's own files and files with an extension (favicon, images).
  matcher: ['/((?!_next/static|_next/image|.*\\.[a-zA-Z0-9]+$).*)'],
}
