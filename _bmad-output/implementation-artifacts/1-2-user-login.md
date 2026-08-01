---
baseline_commit: bcbadb455f564ce4b4e50fa88809a3b34053f93e
---

# Story 1.2: User Login

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a returning user,
I want to log in,
so that I can access my saved interview data.

## Acceptance Criteria

1. **Given** I have an existing account, **when** I submit my correct email and password, **then** I am authenticated **and** redirected to the dashboard.
2. **Given** I have an existing account, **when** I submit an incorrect password **or** an email that doesn't exist, **then** I see a clear "invalid credentials" error **and** I remain on the login page. The message must be **identical** for both cases — see Dev Notes on why.
3. **Given** I am not logged in, **when** I try to visit a protected page (`/dashboard`, and `/interviews` once it exists), **then** I am redirected to the login page.

## Tasks / Subtasks

- [x] Task 1: Build the login page and Server Action (AC: #1, #2)
  - [x] Create `app/(auth)/login/actions.ts` with `'use server'`, mirroring `app/(auth)/register/actions.ts`'s shape: `LoginState = { error?, email?, attempt? }`, read `FormData`, validate, call Supabase, return `{ error }` or `redirect('/dashboard')`
  - [x] Call `supabase.auth.signInWithPassword({ email, password })` — **not** `signUp()`
  - [x] Build the Supabase client **outside** the try/catch wrapping the auth call (see Dev Notes — this exact mistake was made and caught in Story 1.1)
  - [x] Map `error.code` to friendly text; map `invalid_credentials` to the single shared message. Never forward `error.message` to the user
  - [x] Validate only that email and password are **non-empty** — do NOT apply `MIN_PASSWORD_LENGTH` here (see Dev Notes — this would lock out existing accounts)
  - [x] `redirect('/dashboard')` outside the try/catch, success path only
  - [x] Create `app/(auth)/login/page.tsx` as a client component using `useActionState`, mirroring the register page (echo email back, `fieldset disabled={pending}`, persistent `role="alert"` region keyed on `attempt`, `autoComplete="email"` / `autoComplete="current-password"`)
- [x] Task 2: Add route protection and session refresh via `proxy.ts` (AC: #3)
  - [x] Create `proxy.ts` at the **project root** (same level as `app/`), exporting a function named `proxy` — this Next.js version renamed `middleware.ts` to `proxy.ts`; a file named `middleware.ts` will be ignored
  - [x] Create a Supabase client factory for the proxy request/response cookie shape. `lib/supabase/server.ts` **cannot** be reused here — see Dev Notes
  - [x] Call `supabase.auth.getUser()` in the proxy — **not** `getSession()` (see Dev Notes on why this is a security requirement, not a style preference)
  - [x] If no user and the path is protected → redirect to `/login`
  - [x] If a user exists and the path is `/login` or `/register` → redirect to `/dashboard` (clears a deferred item from Story 1.1's review)
  - [x] Return the response object that carries the refreshed auth cookies — do not construct a fresh `NextResponse` after refreshing, or the `Set-Cookie` headers are lost
  - [x] Add a `config.matcher` that skips static assets (`_next/static`, `_next/image`, favicon, image files)
  - [x] Do **not** set a `runtime` config option in `proxy.ts` — it throws an error in this Next.js version
- [x] Task 3: Link the two auth pages together (AC: #2)
  - [x] Add a link from `/login` → `/register` ("Don't have an account? Register")
  - [x] Add a link from `/register` → `/login` ("Already have an account? Log in"), and make the register page's existing "This email is already registered." error a route forward rather than a dead end (deferred item from Story 1.1's review)
- [x] Task 4: Extract the shared form UI both pages now duplicate (AC: #1, #2)
  - [x] Create `components/` at the project root per Architecture §3
  - [x] Extract **only** what the two forms already share verbatim: text field (label + input + error wiring), submit button with pending state, and the alert region. Do not invent a design system, add variants, or introduce a UI library
  - [x] Refactor both `app/(auth)/register/page.tsx` and `app/(auth)/login/page.tsx` to use them, and verify registration still works afterward (regression check — Story 1.1's ACs must not break)

### Review Findings

- [x] [Review][Patch] `proxy.ts` has no failure isolation around Supabase client construction / `getUser()` — a missing env var or a network failure crashes the proxy for nearly every route the matcher covers. `createProxyClient()` calls `supabaseUrl()`/`supabaseAnonKey()` synchronously (`proxy.ts:25`), and both throw when their env var is missing (`lib/supabase/env.ts`). `supabase.auth.getUser()` (`proxy.ts:33`) could similarly throw on a network failure. Unlike `loginAction`/`registerAction`, which explicitly wrap `createClient()` in a try/catch so a missing env var "surfaces as its own named error" instead of crashing, `proxy()` has no equivalent guard. **Decision (resolved):** fail closed — catch the error, log it, treat the request as unauthenticated so protected routes redirect to `/login` while public routes still load. [proxy.ts:25, proxy.ts:33]

- [x] [Review][Patch] `ERROR_MESSAGES` in `login/actions.ts` over-broadly maps `email_not_confirmed` and `user_banned` to the shared `INVALID_CREDENTIALS` message, and carries two sign-up-only codes (`signup_disabled`, `email_provider_disabled`) copy-pasted from the register file without pruning for a sign-in context. AC2 only requires `invalid_credentials`/`user_not_found` to share the identical message — `email_not_confirmed`/`user_banned` describe different account states and deserve honest, distinct messages. Currently dead code since "Confirm email" is OFF in the Supabase project, but becomes misleading the moment that setting changes. [app/(auth)/login/actions.ts:33-41]

- [x] [Review][Patch] Malformed email input (e.g. missing `@`) can trigger a Supabase code such as `email_address_invalid` that is not in `ERROR_MESSAGES`, falling through to `GENERIC_ERROR` ("Could not sign you in...") — a message that reads differently from `INVALID_CREDENTIALS` ("Invalid email or password."). This opens a third, distinguishable message class for malformed input, inconsistent with AC2's intent that failure responses look uniform. [app/(auth)/login/actions.ts:33-43]

- [x] [Review][Patch] Login page's email `TextField` has no `maxLength`, unlike register's equivalent field (which passes `MAX_EMAIL_LENGTH`) and unlike login's own password field (which has an explicit comment justifying the lack of limits). No such rationale exists for the email field's omission — reads as an oversight rather than a deliberate choice. `components/text-field.tsx`'s doc comment ("extracted... once both existed and were provably identical") also slightly overstates this, since the two forms' fields share DOM shape but not identical prop values (register's password field also carries `minLength`/`maxLength` that login's does not, by design). [app/(auth)/login/page.tsx:24-33, components/text-field.tsx:8-13]

- [x] [Review][Defer] bcrypt timing side-channel can distinguish a nonexistent email from a wrong password despite the identical error message, since Supabase fails fast on a nonexistent user but runs a bcrypt comparison for a wrong password on a real one. [app/(auth)/login/actions.ts] — deferred, pre-existing: inherent to any bcrypt-based auth check, not introduced by this diff, and not fixable from application code.

- [x] [Review][Defer] `redirectTo()` in `proxy.ts` constructs a fresh `NextResponse.redirect()` and manually copies cookies from `getResponse()`, which technically brushes against the Dev Notes' warning not to construct a fresh `NextResponse` after a token refresh. [proxy.ts:53-66] — deferred, pre-existing: the copy pattern (`cookies().set(cookie)` with full `ResponseCookie` options) matches Supabase's documented Next.js SSR pattern and is very likely correct; recommend a manual smoke test (log in right as a token refresh fires on a protected-route redirect) rather than a code change.

- [x] [Review][Defer] Proxy `matcher` has no carve-out for future API routes, so every `/api/*` route added later (including anything under `lib/ai/`) will pay a `getUser()` round-trip. [proxy.ts:69-76] — deferred, pre-existing: no API routes exist yet in this diff or story scope.

- [x] [Review][Defer] `AUTH_ROUTES`/`PROTECTED_PREFIXES` disjointness is enforced only by a code comment, with no runtime assertion or test catching a future overlap. [proxy.ts:15-18] — deferred, pre-existing: low risk today with only four hardcoded routes; revisit if the route lists grow.

- [x] [Review][Defer] No brute-force/rate-limiting on login beyond whatever Supabase's default project rate limit provides. [app/(auth)/login/actions.ts] — deferred, pre-existing: already tracked as an infrastructure decision in `deferred-work.md` (round 2, "No abuse control on account creation"); same tradeoff applies to login.

- [x] [Review][Defer] No return-path (`?next=`) preserved across a protected-route redirect — a user bounced off `/interviews/5` lands on `/dashboard` after logging in, not back where they were headed. [proxy.ts:43-45, app/(auth)/login/actions.ts:122] — deferred, pre-existing: nice-to-have, not required by AC3.

### Review Findings — round 2 (patch verification)

- [x] [Review][Patch] `loginAction` never enforces `MAX_EMAIL_LENGTH` server-side — only the client-side `maxLength` prop was added this round. Register applies the same limit in two places (`maxLength` on the client AND an explicit `email.length > MAX_EMAIL_LENGTH` check inside `registerAction`, `app/(auth)/register/actions.ts:78-84`) specifically because an HTML `maxLength` attribute is not a security control — it's bypassable via a direct POST. `loginAction` never got the matching server-side guard. [app/(auth)/login/actions.ts:70-79]

- [x] [Review][Patch] `ERROR_MESSAGES` may still miss a malformed-email code — `email_address_invalid` was added to close the "third distinguishable message" gap, but `@supabase/auth-js`'s `ErrorCode` union also defines `validation_failed`; if the deployed GoTrue version returns that instead for a malformed address, it falls through to `GENERIC_ERROR` again, reopening the same gap this round's patch was meant to close. [app/(auth)/login/actions.ts:41-49]

- [x] [Review][Patch] `user_banned`'s message ("Contact support for help") promises a channel that doesn't exist anywhere in the app — no support link, email, or contact affordance exists on the login page or elsewhere. Reword to not over-promise. [app/(auth)/login/actions.ts:46]

- [x] [Review][Patch] `email_provider_disabled` was kept in `ERROR_MESSAGES` (unlike the correctly-pruned `signup_disabled`) with no comment explaining why — it plausibly can fire on sign-in (it means the whole email/password provider is off, which blocks both signup and signin), unlike `signup_disabled` which is signup-endpoint-only. Add a one-line rationale so it doesn't look like leftover copy-paste. [app/(auth)/login/actions.ts:48]

- [x] [Review][Patch] Doc comment above `ERROR_MESSAGES` says `email_not_confirmed` and `user_banned` "are NOT mapped here" — imprecise, since both are in fact mapped, just to distinct honest messages instead of `INVALID_CREDENTIALS`. Could mislead a future reader into thinking those codes fall through to `GENERIC_ERROR`. [app/(auth)/login/actions.ts:30]

- [x] [Review][Patch] `redirectTo()` in `proxy.ts` carries the original request's query string into the redirect target — `request.nextUrl.clone()` copies `search` along with everything else, and only `pathname` is overwritten before redirecting. E.g. `/dashboard?tab=settings` while logged out redirects to `/login?tab=settings` instead of a clean `/login`. [proxy.ts:67-70]

- [x] [Review][Defer] Single `try/catch` in `proxy.ts` conflates two different failure modes (a permanent env-var misconfiguration vs. a transient Auth-server network blip) under one log line, making them hard to tell apart in production logs. [proxy.ts:33-47] — deferred, pre-existing: a logging/observability polish item, not a functional defect; revisit if it ever needs triaging in practice.

- [x] [Review][Defer] No upper-bound guard on login's password server-side (by design — no `MIN_PASSWORD_LENGTH`, per Dev Notes), but also no `MAX_PASSWORD_BYTES`-style ceiling either, unlike register's guard. [app/(auth)/login/actions.ts] — deferred, pre-existing: minor hardening, not required by spec; bcrypt truncates safely either way.

- [x] [Review][Defer] Proxy matcher excludes `_next/static`, `_next/image`, `favicon.ico`, and image extensions, but not other static assets that could live under `public/` (e.g. `robots.txt`, `manifest.json`, custom fonts) — each pays an unnecessary `getUser()` round trip. [proxy.ts:83-90] — deferred, pre-existing: low-impact performance polish; no such assets exist in this project yet.

- [x] [Review][Defer] `supabase.auth.signInWithPassword()` has no timeout/`AbortController` — a hung Auth-server call leaves the form's pending state stuck indefinitely. [app/(auth)/login/actions.ts:98] — deferred, pre-existing: identical pattern to register's already-accepted `signUp()` call; not introduced by this round's changes.

- [x] [Review][Defer] Asymmetric `getResponse` identity between the try/catch fallback (`() => NextResponse.next({ request })`, a new object every call) and the success path (`client.getResponse`, a stored reference) in `proxy.ts`. [proxy.ts:25, proxy.ts:35] — deferred, pre-existing: currently harmless since nothing compares identity; flag if the fallback path is ever extended.

## Dev Notes

### `proxy.ts`, not `middleware.ts` — this version renamed the convention

Next.js 16 deprecated and renamed `middleware` to `proxy`. The file must be `proxy.ts` at the project root, exporting a single function named `proxy` (or a default export). A file called `middleware.ts` is simply not picked up, so the symptom of getting this wrong is silent: no protection, no error, AC3 fails while everything looks fine.

Two further constraints from the same doc:
- **Proxy defaults to the Node.js runtime** in v16. The `runtime` config option is **not available** and setting it throws.
- Proxy is designed to run at a network boundary, potentially outside the app's main runtime. Do not rely on shared globals or module state inside it.

[Source: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`]

### Why `lib/supabase/server.ts` cannot be reused in the proxy

The existing server client is wired to `cookies()` from `next/headers`. The proxy does not have that — it receives a `NextRequest` and must write cookies onto a `NextResponse`. These are two different cookie interfaces, so the proxy needs its own client factory with `getAll`/`setAll` reading from `request.cookies` and writing to both the request (so the current pass sees them) and the response (so the browser receives them).

**Do reuse** `lib/supabase/env.ts`'s `supabaseUrl()` / `supabaseAnonKey()` — do not read `process.env` again. Story 1.1's review specifically removed non-null assertions in favour of those validated readers.

The cookie-write step is where this pattern usually breaks: after `getUser()` triggers a token refresh, the new cookies live on the response object you passed in. If the code then builds a *new* `NextResponse` to return, the `Set-Cookie` headers are dropped and the user is silently logged out on the next request.

### `getUser()`, not `getSession()` — a security requirement

`getSession()` reads and decodes the session cookie without verifying it against Supabase. A cookie is client-controlled data, so a forged one would pass. `getUser()` makes a call to the Auth server that validates the token. In anything that makes an authorization decision — which is exactly what the proxy does — `getUser()` is the only safe choice.

[Source: `node_modules/@supabase/ssr/README.md` → "Known patterns and limitations"]

### Refresh tokens are single-use — why the proxy pattern matters

Supabase refresh tokens can only be used once. If two requests carrying the same expired session arrive simultaneously (two tabs opening together), the first consumes the token and the second gets `session: null`. The proxy pattern mitigates the common case because it runs once per navigation and refreshes before the page renders. It does not eliminate the problem for parallel client-side `fetch()` calls, so code that reads a session must tolerate `null` rather than assume it.

[Source: `node_modules/@supabase/ssr/README.md` → "Concurrent requests with the same expired session"]

### Redirect loops are the most likely way to break this story

Two mistakes both produce an infinite redirect, and the browser will simply show `ERR_TOO_MANY_REDIRECTS` with no useful stack trace:

1. **Protecting `/login` itself.** If the matcher covers `/login` and the "no user → redirect to `/login`" rule runs on it, a logged-out visitor is redirected to `/login` forever. The auth pages must be reachable while logged out.
2. **The logged-in rule and the logged-out rule overlapping.** "No user → `/login`" and "user → `/dashboard`" must apply to disjoint sets of paths. Decide the path's category first, then apply exactly one rule.

Sanity check before calling AC3 done: logged out, `/login` and `/register` must load normally; logged in, `/dashboard` must load normally. If either loops, the path classification is wrong.

### Cost of `getUser()` on every request

`getUser()` makes a network call to the Supabase Auth server. Running it in the proxy means one such call per matched navigation, which is the accepted trade-off for a trustworthy auth check. Keep the matcher tight so it does not fire on static assets — that is what the `config.matcher` exclusions are for, not merely tidiness. Do not "optimize" this by switching to `getSession()`; that reintroduces the security hole described above.

### AC2's identical error message is deliberate — and it is the opposite of registration

Login must return the same message whether the email does not exist or the password is wrong. If the two differ, the login form becomes an account-enumeration oracle: an attacker learns which emails have accounts by watching which error comes back. Supabase already helps here by returning a single `invalid_credentials` code for both.

Note the deliberate asymmetry with Story 1.1: **registration does reveal** that an email is taken, because AC2 of that story requires it. That trade-off is documented in Story 1.1's Decision 1. Do not "fix" the login message to match the register message — the difference is intentional.

### Do NOT enforce the password minimum on login

`MIN_PASSWORD_LENGTH` (8) lives in `app/(auth)/register/constants.ts` and belongs to **registration only**. Applying it to login would lock out any account created under a different rule — including accounts made against Supabase's own 6-character default before the app's rule existed. Login validates only that the fields are non-empty; Supabase decides whether the credentials are correct.

### Reuse the patterns Story 1.1 established, and the mistakes it already paid for

`app/(auth)/register/actions.ts` is the reference implementation. Copy its structure; it was hardened over two review rounds. Specifically:

- **Build the client outside the try.** Story 1.1 shipped `createClient()` inside the `try`, which swallowed `env.ts`'s named-variable error and showed the user a generic message instead. It was caught in review round 2. Do not repeat it.
- **`redirect()` outside the try/catch.** It works by throwing `NEXT_REDIRECT`; a `catch` swallows it and the redirect silently never happens.
- **Map `error.code`, never `error.message`.** Matching on English prose breaks when upstream rewords it, and raw text leaks backend state — a live test showed `email rate limit exceeded` rendered to the browser.
- **Log before returning a vague message.** Expected user errors (`invalid_credentials`) → `console.warn`; unexpected failures → `console.error`. Routine typos should not trigger production alerts.
- **Echo the email back, never the password**, and use the `attempt` counter as the React key on the alert region so repeat failures are re-announced by screen readers.

### What this story does NOT include

- **Logout / sign-out.** No AC covers it. This creates a practical testing problem: once logged in, the proxy will bounce you away from `/login`. To re-test AC1, clear the `sb-<ref>-auth-token` cookie in DevTools or use a private window. Flag sign-out as a gap for a later story rather than building it here.
- **The `/interviews` route.** AC3 mentions it, but it does not exist yet. Write the matcher so it covers `/interviews` when that route lands, but do not create the page.
- **Real dashboard content.** Still Story 5.1's job. `app/dashboard/page.tsx` stays a placeholder.
- **A design system.** Task 4 extracts only what already exists in duplicate. Visual design work is deliberately scheduled after Epic 1.

### Deferred items from Story 1.1 that this story closes

See `_bmad-output/implementation-artifacts/deferred-work.md`. This story resolves four of the six entries: the `/dashboard` auth guard, session refresh, the missing login link, and redirecting an already-authenticated user away from the auth pages. The remaining two (abuse/rate limiting, and `/register` having no entry point from the home page) stay deferred.

### Project Structure Notes

- `app/(auth)/login/` mirrors `app/(auth)/register/` — Architecture §3 shows both under the `(auth)` route group. The colocated `actions.ts` follows the same accepted variance recorded in Story 1.1.
- `proxy.ts` at the project root is a new top-level file not shown in Architecture §3's tree. It is required to live there by the framework, so this is a framework constraint rather than a design choice.
- `components/` at the project root is specified by Architecture §3 ("reusable UI components") and is created for the first time by Task 4.
- The proxy's Supabase client factory should sit alongside the existing two in `lib/supabase/` (Architecture §3 requires the clients be kept separate and explicit).

### Testing

No automated test suite for this MVP (Architecture §8). Verify manually, and note that AC1 and AC3 interact — test them in this order:

1. **AC3 first, while logged out:** clear cookies, visit `/dashboard` directly → redirected to `/login`. This is the check that actually proves the proxy works; Story 1.1's review recorded a false claim on exactly this point, so verify it by observing the redirect, not by assuming.
2. **AC1:** log in with the account created during Story 1.1 → redirected to `/dashboard`, and confirm an `sb-<ref>-auth-token` cookie exists. The cookie is the evidence, not the redirect.
3. **AC2, both halves:** wrong password on a real account, then a non-existent email. Confirm the two messages are byte-identical and you stay on `/login`.
4. **Regression:** registration (Story 1.1's AC1/AC2) must still work after Task 4's refactor.
5. **Logged-in redirect:** while logged in, visit `/login` → bounced to `/dashboard`.

### References

- [Source: `_bmad-output/planning-artifacts/epics.md#Story-1.2`] — AC source
- [Source: `docs/architecture.md#3-source-tree`] — `(auth)` route group, `lib/supabase/`, `components/`
- [Source: `docs/architecture.md#2-tech-stack`] — Supabase Auth, email/password for MVP
- [Source: `docs/architecture.md#8-testing-strategy`] — manual testing only
- [Source: `docs/architecture.md#9-security`] — RLS everywhere; auth key server-side only
- [Source: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`] — `proxy.ts` naming, root location, Node.js runtime default, `runtime` option throws
- [Source: `node_modules/@supabase/ssr/README.md`] — `getUser()` vs `getSession()`, single-use refresh tokens, middleware/proxy pattern
- [Source: `_bmad-output/implementation-artifacts/1-1-user-registration.md`] — established action/page patterns and the review findings this story must not repeat
- [Source: `_bmad-output/implementation-artifacts/deferred-work.md`] — the deferred items this story closes

## Dev Agent Record

### Agent Model Used

Claude Opus 5 (claude-opus-5)

### Debug Log References

- `npm run build` — compiled successfully, TypeScript passed. Route table lists `/login` and, critically, **`ƒ Proxy (Middleware)`** — that line is the proof Next.js actually picked up `proxy.ts`. Had the file been named `middleware.ts`, the build would have succeeded identically with no proxy entry and no warning.
- `npm run lint` — clean.
- Dev server request log shows a `proxy.ts:` timing segment on every request (e.g. `GET /dashboard 200 in 473ms (next.js: 44ms, proxy.ts: 383ms, ...)`), confirming the proxy runs per navigation.

**AC3 + redirect-loop check (via `curl`, no cookies = guaranteed logged-out):**

| Path | Result |
|---|---|
| `/dashboard` | `307` → `http://localhost:3000/login` ✅ |
| `/login` | `200`, no redirect (no loop) ✅ |
| `/register` | `200`, no redirect (no loop) ✅ |
| `/` | `200` ✅ |

**AC2 — both halves produce byte-identical output:**
- Wrong password on a real account → alert text `"Invalid email or password."`, stayed on `/login`
- Non-existent email → alert text `"Invalid email or password."`, stayed on `/login`
- Server logged `code: 'invalid_credentials', status: 400` for **both**, confirming Supabase itself returns one code for the two cases — the identical message is not a hand-rolled disguise.
- Email echoed back into the field on both failures; password cleared.

**AC1** — correct credentials → `POST /login 303` → landed on `/dashboard`. Because the proxy now calls `getUser()` on every matched request, reaching `/dashboard` genuinely proves a valid session exists: without one the proxy would have redirected to `/login`. (Story 1.1 made this claim when it was *not* true; it is true now, and for a different reason.)

**Logged-in redirect** — while authenticated, `/login` and `/register` both landed on `/dashboard`.

**Regression after the Task 4 refactor** — registration still works: duplicate email rendered `"This email is already registered."`, and the accessibility wiring survived the extraction (`aria-invalid="true"`, `aria-describedby="register-error"`).

### Completion Notes List

- **Deviation from the workflow's red-green-refactor steps:** this project has no automated test suite by design (Architecture §8, `project-context.md`, and this story's Testing section all specify manual verification only). Steps 5–7's TDD cycle was therefore satisfied by live browser and `curl` verification of every AC rather than by unit tests. Flagged explicitly rather than silently skipped.
- `lib/supabase/server.ts` was **not** reused in the proxy. It is bound to `cookies()` from `next/headers`; the proxy has `NextRequest`/`NextResponse`. `lib/supabase/proxy-client.ts` is a third factory for that cookie shape, and it returns `getResponse()` rather than a response value because `setAll` replaces the response object when a token refresh occurs.
- Both Supabase clients reuse `lib/supabase/env.ts`; no new `process.env` reads were introduced.
- Login deliberately does **not** import `MIN_PASSWORD_LENGTH`. Enforcing the register form's 8-character rule at sign-in would lock out any account created under a different minimum.
- The `AUTH_ROUTES` / `PROTECTED_PREFIXES` lists are disjoint by construction, which is what prevents the redirect loop. Verified empirically in the AC3 table above, not just by reading the code.
- Task 4 extracted only the three pieces both forms already shared verbatim (`TextField`, `FormAlert`, `SubmitButton`). No variants, no design system, no UI library. `FormAlert` owns its own `key` so a caller cannot forget it and silently lose the screen-reader re-announcement.
- **Known gap, no AC covers it:** there is still no sign-out. Once logged in, the proxy bounces you away from `/login`, so re-testing sign-in requires clearing the `sb-<ref>-auth-token` cookie manually. Worth a story of its own.
- Four of the six items in `deferred-work.md` are now closed by this story: the `/dashboard` auth guard, session refresh, the missing login link, and redirecting authenticated users away from the auth pages. The two that remain are abuse/rate limiting and `/register` having no entry point from the home page.

### File List

- `app/(auth)/login/actions.ts` (new)
- `app/(auth)/login/page.tsx` (new)
- `app/(auth)/register/page.tsx` (modified — refactored onto shared components, added link to `/login`)
- `lib/supabase/proxy-client.ts` (new)
- `proxy.ts` (new — project root, required location)
- `components/text-field.tsx` (new)
- `components/form-alert.tsx` (new)
- `components/submit-button.tsx` (new)
- `_bmad-output/implementation-artifacts/1-2-user-login.md` (this file)

## Change Log

- 2026-07-31: Implemented Tasks 1–4 — login page and Server Action, route protection and session refresh via `proxy.ts`, links between the two auth pages, and extraction of the shared form components. All three ACs verified live against the real Supabase project, plus a redirect-loop check and a registration regression check. Status: review.
