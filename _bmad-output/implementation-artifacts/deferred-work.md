# Deferred Work

## Deferred from: code review of 1-1-user-registration (2026-07-31)

- **`/dashboard` renders for anonymous visitors with no auth guard** — `app/dashboard/page.tsx` has no session check, so anyone can load it and see "You're logged in." Story 1.2 owns route protection via `proxy.ts` (this Next.js version's renamed `middleware.ts`). Note: this also means manual testing of Story 1.1's AC1 cannot tell a real login from a null-session failure, because the redirect target asserts a login state it never verifies.
- **No session-refresh middleware, so expired access tokens are never refreshed** — `lib/supabase/server.ts` builds a client per request, but nothing refreshes the token between requests. Once the access token TTL elapses, server-side Supabase calls start failing. Story 1.2's `proxy.ts` is the intended home for the refresh call.
- **"This email is already registered" is a UX dead end** — `app/(auth)/register/page.tsx` shows the error but offers no route forward, and `app/(auth)/login/` does not exist yet. Story 1.2 adds the login page; link to it from this error at that point.

## Deferred from: code review of 1-1-user-registration, round 2 (2026-07-31)

- **No abuse control on account creation** — turning "Confirm email" OFF was the right call for AC1, but Supabase's email rate limit was the only thing incidentally throttling signups. The Server Action is directly callable, so the disabled `<fieldset>` and HTML validation are not controls. There is no rate limit, captcha, or per-IP throttle. Needs an infrastructure decision (Supabase Auth rate limits, Vercel middleware, or a captcha provider) that is beyond MVP scope — revisit before any public deploy.
- **`/register` has no entry point in the app** — `app/page.tsx` is still the unmodified create-next-app template and nothing links to `/register`, so the feature is reachable only by typing the URL. Pair this with Story 1.2's login page so the two auth routes get a shared entry point.
- **An already-authenticated user can open `/register`** — submitting again either fails as a duplicate or replaces the current session. Story 1.2's route protection should redirect a logged-in visitor away from `/register`.
