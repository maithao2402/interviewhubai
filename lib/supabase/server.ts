import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { supabaseAnonKey, supabaseUrl } from './env'

export async function createClient() {
  // cookies() returns a Promise in this Next.js version. It must be awaited
  // before .getAll()/.set(), or session cookies silently fail to read/write.
  const cookieStore = await cookies()

  return createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        } catch (err) {
          // Next.js forbids writing cookies during a Server Component render.
          // Today the only caller is a Server Action, where writes DO succeed —
          // so reaching this branch means something genuinely went wrong, and
          // it is logged rather than silently ignored. Once Story 1.2 adds
          // proxy.ts, a swallowed write here would mean a dropped session with
          // no trace at all.
          console.error('[supabase] failed to write auth cookies', err)
        }
      },
    },
  })
}
