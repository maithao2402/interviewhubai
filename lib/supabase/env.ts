/**
 * Reads the Supabase environment variables, failing loudly when one is missing.
 *
 * These used to be read as `process.env.NEXT_PUBLIC_SUPABASE_URL!`. The `!`
 * told TypeScript "trust me, this exists" — so a missing or misspelled
 * variable produced an opaque runtime failure (a generic "Something went
 * wrong" on the server, a blank page in the browser) instead of naming the
 * variable that is actually missing.
 *
 * Each variable is read via static member access on `process.env`. Next.js
 * only inlines `NEXT_PUBLIC_*` values into the browser bundle when they are
 * written out in full like this — `process.env[someVariable]` would compile to
 * `undefined` on the client.
 */
function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. Copy .env.example to .env.local and fill it in.`
    )
  }

  return value
}

export function supabaseUrl(): string {
  return required('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL)
}

export function supabaseAnonKey(): string {
  return required(
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
}
