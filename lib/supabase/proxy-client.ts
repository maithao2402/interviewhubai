import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { supabaseAnonKey, supabaseUrl } from './env'

/**
 * Supabase client for the proxy (this Next.js version's renamed middleware).
 *
 * `lib/supabase/server.ts` cannot be reused here. That client is wired to
 * `cookies()` from `next/headers`, which the proxy does not have — the proxy
 * receives a `NextRequest` and must write cookies onto a `NextResponse`. Two
 * different cookie interfaces, so two different factories.
 *
 * Reading a token can also refresh it, and the refreshed cookies land on the
 * response object created here. That is why the caller gets `getResponse()`
 * rather than a plain response: `setAll` replaces the response, so a value
 * captured once up front would be stale. Returning a freshly built
 * `NextResponse` instead of this one silently drops the `Set-Cookie` headers,
 * and the user is logged out again on their next request.
 */
export function createProxyClient(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        // Write to the request first so anything later in this same pass reads
        // the refreshed value, then rebuild the response carrying the cookies
        // that actually reach the browser.
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))

        response = NextResponse.next({ request })

        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        )
      },
    },
  })

  return { supabase, getResponse: () => response }
}
