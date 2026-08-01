import { NextResponse, type NextRequest } from 'next/server'
import { createProxyClient } from '@/lib/supabase/proxy-client'

/**
 * Route protection and session refresh.
 *
 * This file MUST be named `proxy.ts` and live at the project root. This
 * Next.js version renamed the `middleware` convention to `proxy`; a file called
 * `middleware.ts` is ignored entirely — no error, no warning, just no
 * protection. Do not set a `runtime` config option here either: Proxy defaults
 * to the Node.js runtime in v16 and setting `runtime` throws.
 */

/** Reachable only while logged OUT. A logged-in visitor is sent to the dashboard. */
const AUTH_ROUTES = ['/login', '/register']

/** Reachable only while logged IN. A logged-out visitor is sent to the login page. */
const PROTECTED_PREFIXES = ['/dashboard', '/interviews']

function matches(pathname: string, routes: string[]) {
  return routes.some((route) => pathname === route || pathname.startsWith(`${route}/`))
}

export async function proxy(request: NextRequest) {
  let getResponse = () => NextResponse.next({ request })
  let user = null

  // Fail closed: createProxyClient() throws if a Supabase env var is missing,
  // and getUser() can throw on a network failure talking to the Auth server.
  // Either way we log it and fall through with user = null, so protected
  // routes redirect to /login instead of the proxy crashing the whole site
  // on every matched request.
  try {
    const client = createProxyClient(request)
    getResponse = client.getResponse

    // getUser(), never getSession(). getSession() only decodes the cookie, and a
    // cookie is client-controlled data — a forged one would pass. getUser()
    // validates the token against the Auth server. This is an authorization
    // decision, so the verified answer is the only acceptable one.
    const {
      data: { user: verifiedUser },
    } = await client.supabase.auth.getUser()
    user = verifiedUser
  } catch (err) {
    console.error('[proxy] could not verify the session', err)
  }

  const { pathname } = request.nextUrl

  // The two route lists are disjoint on purpose. If a path could match both,
  // the two redirect rules below would bounce the browser between them forever
  // and surface as ERR_TOO_MANY_REDIRECTS with nothing useful to debug.
  const isAuthRoute = matches(pathname, AUTH_ROUTES)
  const isProtected = matches(pathname, PROTECTED_PREFIXES)

  if (!user && isProtected) {
    return redirectTo('/login')
  }

  if (user && isAuthRoute) {
    return redirectTo('/dashboard')
  }

  return getResponse()

  function redirectTo(pathname: string) {
    const url = request.nextUrl.clone()
    url.pathname = pathname
    // clone() also copies the original request's query string. Clear it so a
    // redirect to /login or /dashboard doesn't carry over unrelated params
    // from the page the visitor was leaving.
    url.search = ''

    const redirect = NextResponse.redirect(url)

    // Carry over any cookies the refresh above produced. A bare
    // NextResponse.redirect() would discard them and throw away the new tokens.
    getResponse()
      .cookies.getAll()
      .forEach((cookie) => redirect.cookies.set(cookie))

    return redirect
  }
}

export const config = {
  // Run on everything except static assets. Each matched request costs one
  // getUser() call to the Auth server, so excluding assets is about avoiding
  // pointless network calls, not just tidiness.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
