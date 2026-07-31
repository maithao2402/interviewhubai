# Deferred Work

## Deferred from: code review of 1-1-user-registration (2026-07-31)

- **`/dashboard` renders for anonymous visitors with no auth guard** — `app/dashboard/page.tsx` has no session check, so anyone can load it and see "You're logged in." Story 1.2 owns route protection via `proxy.ts` (this Next.js version's renamed `middleware.ts`). Note: this also means manual testing of Story 1.1's AC1 cannot tell a real login from a null-session failure, because the redirect target asserts a login state it never verifies.
- **No session-refresh middleware, so expired access tokens are never refreshed** — `lib/supabase/server.ts` builds a client per request, but nothing refreshes the token between requests. Once the access token TTL elapses, server-side Supabase calls start failing. Story 1.2's `proxy.ts` is the intended home for the refresh call.
- **"This email is already registered" is a UX dead end** — `app/(auth)/register/page.tsx` shows the error but offers no route forward, and `app/(auth)/login/` does not exist yet. Story 1.2 adds the login page; link to it from this error at that point.

## Deferred from: code review of 1-1-user-registration, round 2 (2026-07-31)

- **No abuse control on account creation** — turning "Confirm email" OFF was the right call for AC1, but Supabase's email rate limit was the only thing incidentally throttling signups. The Server Action is directly callable, so the disabled `<fieldset>` and HTML validation are not controls. There is no rate limit, captcha, or per-IP throttle. Needs an infrastructure decision (Supabase Auth rate limits, Vercel middleware, or a captcha provider) that is beyond MVP scope — revisit before any public deploy.
- **`/register` has no entry point in the app** — `app/page.tsx` is still the unmodified create-next-app template and nothing links to `/register`, so the feature is reachable only by typing the URL. Pair this with Story 1.2's login page so the two auth routes get a shared entry point.
- **An already-authenticated user can open `/register`** — submitting again either fails as a duplicate or replaces the current session. Story 1.2's route protection should redirect a logged-in visitor away from `/register`.

## Deferred from: code review of 1-2-user-login (2026-07-31)

- **bcrypt timing side-channel on login** — Supabase fails fast for a nonexistent email but runs a bcrypt comparison for a wrong password on a real one, so response timing can distinguish the two cases despite the identical error message. Inherent to any bcrypt-based auth check, not fixable from `app/(auth)/login/actions.ts`.
- **`proxy.ts`'s redirect cookie-copy pattern is unverified live** — `redirectTo()` builds a fresh `NextResponse.redirect()` and copies cookies over from `getResponse()`. The pattern matches Supabase's documented Next.js SSR approach and is very likely correct, but recommend a manual smoke test: log in right as a token refresh fires on a protected-route redirect, and confirm the `Set-Cookie` headers carry over in the browser.
- **Proxy matcher has no carve-out for future API routes** — every `/api/*` route added later (including anything under `lib/ai/`) will pay a `getUser()` round-trip to the Auth server. Revisit when the first API route lands.
- **`AUTH_ROUTES`/`PROTECTED_PREFIXES` disjointness is enforced only by a comment** — no runtime assertion or test catches a future overlap between the two lists. Low risk today with four hardcoded routes; revisit if the lists grow.
- **No brute-force/rate-limiting on login beyond Supabase's default project rate limit** — same open infrastructure decision as the round-2 "No abuse control on account creation" entry above; applies equally to `loginAction`.
- **No return-path (`?next=`) preserved across a protected-route redirect** — a user bounced off a protected page lands on `/dashboard` after logging in, not back where they were headed. Nice-to-have, not required by AC3.

## Deferred from: code review of 1-2-user-login, round 2 (2026-07-31)

- **`proxy.ts`'s single `try/catch` conflates two failure modes** — a permanent env-var misconfiguration and a transient Auth-server network blip both land in the same `console.error('[proxy] could not verify the session', ...)` line, making them hard to tell apart in production logs. Observability polish, not a functional defect.
- **No `MAX_PASSWORD_BYTES`-style upper bound on login's password server-side** — by design there's no `MIN_PASSWORD_LENGTH` check (per Dev Notes), but there's also no max-length ceiling, unlike register's guard. bcrypt truncates safely either way, so this is minor hardening, not a bug.
- **Proxy matcher doesn't exclude non-image static assets** — `robots.txt`, `manifest.json`, custom fonts under `public/` would each pay an unnecessary `getUser()` round trip. No such assets exist in this project yet.
- **`supabase.auth.signInWithPassword()` has no timeout/`AbortController`** — a hung Auth-server call leaves the form's pending state stuck indefinitely. Identical pattern to register's already-accepted `signUp()` call.
- **Asymmetric `getResponse` identity in `proxy.ts`'s fail-closed fallback** — the catch-block fallback builds a fresh `NextResponse` on every call, while the success path returns a stored reference. Currently harmless since nothing compares identity.
