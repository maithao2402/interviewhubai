---
baseline_commit: ee583f9e37577b211b916d867bacb034b8b2882d
---

# Story 2.1: Select Interview Parameters

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to select role/level/type/difficulty/duration,
so that the interview matches what I'm preparing for.

## Acceptance Criteria

1. **Given** I am on the "New Interview" page, **when** the form loads, **then** I see selectors for role (Frontend/Backend/Fullstack/Mobile/DevOps), level (Intern/Fresher/Junior/Middle), interview type (Technical/Behavioral/Mixed), difficulty, and duration (15/30/45/60 minutes).
2. **Given** I select a duration, **when** the form computes `max_questions`, **then** it maps correctly: 15min→3, 30min→5, 45min→7, 60min→9. The derived value must be **visible in the UI**, not only held in state — otherwise this AC cannot be verified without a debugger (see Dev Notes).
3. **Given** I have not selected all required fields, **when** I try to proceed, **then** I see a validation message and cannot continue.

## Tasks / Subtasks

- [x] Task 1: Define the intake option sets as the single source of truth (AC: #1, #2)
  - [x] Create `lib/types/interview.ts` — Architecture §3 reserves `lib/types/` for shared TypeScript types, and it is still empty. This is its first user
  - [x] Export `as const` arrays with **exactly** these strings, case-sensitive: `ROLES = ['Frontend','Backend','Fullstack','Mobile','DevOps']`, `LEVELS = ['Intern','Fresher','Junior','Middle']`, `INTERVIEW_TYPES = ['Technical','Behavioral','Mixed']`. These must byte-match the `check` constraints already live in the database — see Dev Notes "Values are a contract with the database"
  - [x] Export `DIFFICULTIES = ['Easy','Medium','Hard'] as const`. **No planning document defines these values — this story defines them.** Architecture §4 leaves the `difficulty` column deliberately unconstrained, so nothing catches a mismatch at write time. Add a comment in the file saying so
  - [x] Export the duration table as one structure, not two parallel lists: `DURATION_OPTIONS = [{ minutes: 15, maxQuestions: 3 }, { minutes: 30, maxQuestions: 5 }, { minutes: 45, maxQuestions: 7 }, { minutes: 60, maxQuestions: 9 }] as const`
  - [x] Export `maxQuestionsFor(minutes)` derived from `DURATION_OPTIONS` — do **not** write a second `switch`/lookup anywhere. One table, one reader
  - [x] Derive the union types from the arrays (`export type Role = (typeof ROLES)[number]`) so adding a value to an array updates the type automatically
  - [x] Export the form's state type, e.g. `type InterviewIntake = { role: Role | '', level: Level | '', interviewType: InterviewType | '', difficulty: Difficulty | '', durationMinutes: DurationMinutes | '' }`. The `| ''` empty state is required by AC3 — see Dev Notes
  - [x] Do **not** add `zod` in this story — no API route exists yet (see Dev Notes "Do not install zod yet")
- [x] Task 2: Build the reusable select field component (AC: #1)
  - [x] Create `components/select-field.tsx` (kebab-case file, `SelectField` PascalCase export) — five near-identical selects justify one component, the same threshold Story 1.2's Task 4 used
  - [x] Mirror `components/text-field.tsx`'s shape exactly: `label` + control + `aria-invalid` / `aria-describedby` wiring, `space-y-1` wrapper, same input classes. Read that file first and match it
  - [x] Props: `id`, `name`, `label`, `value`, `onChange`, `options: readonly string[]`, `placeholder`, `error?: string`. Controlled component (`value` + `onChange`), **not** `defaultValue` — the page owns the state
  - [x] Render a disabled placeholder `<option value="">` first (e.g. "Select a role"), so nothing is preselected
  - [x] Do **not** set the HTML `required` attribute — it short-circuits React's submit handler and the AC3 message never renders (see Dev Notes)
  - [x] Do not widen `TextField` to cover selects, and do not build a design system. Only this one component
- [x] Task 3: Build the New Interview page (AC: #1, #2, #3)
  - [x] Create `app/interviews/new/page.tsx` with `'use client'` at the top — same pattern as `app/(auth)/register/page.tsx`, which is itself the client component rather than wrapping one
  - [x] Do **not** create `app/interviews/page.tsx` (history list, Story 5.2) or `app/interviews/[id]/*` (Epic 3/4). A route at `/interviews/new` works without a parent `page.tsx`
  - [x] Hold all five fields in **one** `useState<InterviewIntake>` object, not five separate `useState` calls — Stories 2.2 and 2.3 add `resumeText` and `jobDescription` to this same object
  - [x] Render the five `SelectField`s in the AC1 order: role, level, interview type, difficulty, duration
  - [x] Duration option labels read "15 minutes", "30 minutes", … while the value is the number. Keep the label/value split inside the page, not in `lib/types/interview.ts`
  - [x] **AC2 must be visible:** next to (or under) the duration selector, render the derived count once a duration is picked — e.g. "This interview will have 5 questions." Use `maxQuestionsFor()`; never a hardcoded number
  - [x] Add a submit button labelled "Start Interview" using the existing `components/submit-button.tsx` (`pending={false}` for now — nothing is async in this story)
  - [x] Add `noValidate` to the `<form>` and own validation in React (see Dev Notes)
  - [x] On submit: if any field is `''`, set per-field error messages, render them through `SelectField`'s `error` prop, and **do not proceed**. Also render a `FormAlert` summary using the existing `components/form-alert.tsx`, keyed on an `attempt` counter exactly as the auth forms do
  - [x] On a valid submit: do **not** navigate, do **not** call any API, do **not** write to Supabase. Nothing is persisted until Story 3.1. `console.log` the assembled payload (including the derived `max_questions`) with a clear comment marking it as Story 3.1's insertion point, and note in the Completion Notes that this log is temporary
- [x] Task 4: Make the page reachable (AC: #1)
  - [x] Add a link to `/interviews/new` from `app/dashboard/page.tsx` (still the Story 1.1 placeholder), using `next/link` like the auth pages do
  - [x] Not spelled out in any AC, but AC1 says "Given I am on the New Interview page" and today nothing in the app can get you there. `deferred-work.md` already tracks the same class of problem for `/register`. Keep it to one link — no navigation shell, no layout redesign
  - [x] Do **not** touch `proxy.ts`: `PROTECTED_PREFIXES` already contains `/interviews`, so `/interviews/new` is protected and logged-out visitors are redirected to `/login`. Confirm this by observation during testing rather than assuming

### Review Findings

- [x] [Review][Patch] Wrap the intake fields in a `<fieldset disabled={pending}>` for consistency with the double-submit-protection convention `login`/`register` use, even though `pending` is hardcoded `false` today [app/interviews/new/page.tsx:117]
- [x] [Review][Patch] Add `aria-required="true"` to the `<select>` so screen-reader/keyboard users know a field is mandatory before the first failed submit [components/select-field.tsx:56]
- [x] [Review][Patch] ~~Guard the render-time call to `maxQuestionsFor()`~~ — **round-2 correction:** the first attempt (a second `DURATION_OPTIONS.find()` inline in the page) was itself flagged by the round-2 Acceptance Auditor as violating this file's own "one table, one reader" rule, and was unnecessary — `intake.durationMinutes !== ''` already narrows the type so `maxQuestionsFor()` cannot throw at this call site. Reverted to calling `maxQuestionsFor(intake.durationMinutes)` directly, matching the submit handler and keeping the single reader [lib/types/interview.ts:61, app/interviews/new/page.tsx:213-217]
- [x] [Review][Patch] Add `aria-required="true"` to the `<select>` so screen-reader/keyboard users know a field is mandatory before the first failed submit [components/select-field.tsx:56]
- [x] [Review][Defer] `difficulty` values have zero enforcement anywhere (no DB check, no lint) and feed straight into a paid AI call in Epic 3 — deliberate per Architecture §4, but worth a forward reminder when Epic 3 lands [lib/types/interview.ts:37] — deferred, pre-existing
- [x] [Review][Defer] `SelectField.options` is typed as plain `readonly string[]` and each page-level `onChange` blind-casts the DOM string to the target field's type; nothing stops a field/options mismatch or an out-of-enum value from silently entering state. Story 3.1's planned `z.enum(ROLES)` validation (per this story's own Dev Notes) is the real fix [components/select-field.tsx:24, app/interviews/new/page.tsx:119-171] — deferred, pre-existing
- [x] [Review][Defer] `FormAlert`'s single live-region message is a generic "every field" summary even when only one field is missing; accurate per-field reasons exist but are plain text, not live regions — a deliberate tradeoff (documented in select-field.tsx) to avoid five simultaneous announcements, worth revisiting if accessibility feedback comes in [app/interviews/new/page.tsx:183-187] — deferred, pre-existing
- [x] [Review][Defer] The temporary `console.log` of the intake payload on valid submit is flagged for removal in Story 3.1 — flagging forward because Stories 2.2/2.3 add `resumeText`/`jobDescription` to this same object, and copying this debug pattern would log actual resume content [app/interviews/new/page.tsx:97-104] — deferred, pre-existing
- [x] [Review][Defer] No cancel / back-to-dashboard link on `/interviews/new`; combined with the (spec-sanctioned) lack of persistence, a user who wants out has only the browser back button with no confirmation. Not required by any AC — a UX nicety for a later story [app/interviews/new/page.tsx:107-195] — deferred, pre-existing
- [x] [Review][Defer] No focus management after a failed submit — focus stays wherever it was instead of moving to the `FormAlert` region or the first invalid field, so keyboard/screen-reader users must hunt through five selects. Neither existing auth form (`login`/`register`) does this either, so it's a codebase-wide pattern gap, not specific to this page [app/interviews/new/page.tsx:186-190] — deferred, pre-existing
- [x] [Review][Defer] No double-submit guard on `handleSubmit` (e.g. rapid double-click/Enter) — currently harmless since the handler is synchronous and nothing is persisted this story; Story 3.1's async `POST /api/interviews` is where this needs real handling, and the `<fieldset disabled={pending}>` added above is the scaffold for it [app/interviews/new/page.tsx:74-105] — deferred, pre-existing

## Dev Notes

### Values are a contract with the database — a typo is a runtime `23514`

The `interviews` table is already live in Supabase with these `check` constraints (Story 1.3, Architecture §4 v0.3):

```sql
role text not null check (role in ('Frontend','Backend','Fullstack','Mobile','DevOps')),
level text not null check (level in ('Intern','Fresher','Junior','Middle')),
interview_type text not null check (interview_type in ('Technical','Behavioral','Mixed')),
difficulty text not null,                       -- deliberately unconstrained
check ((duration_minutes, max_questions) in ((15,3),(30,5),(45,7),(60,9)))
```

These are **case-sensitive string comparisons**. `'frontend'` or `'Mid'` is not rejected by TypeScript, not rejected by the UI, and not rejected until Story 3.1's `insert` fails with SQLSTATE `23514` — after the user filled in the whole form. Story 1.3's Debug Log records exactly this happening: a test row written with `level = 'Mid'` later blocked a migration.

The duration/max_questions pairing is checked **as a pair**, not per column. `{duration_minutes: 15, max_questions: 5}` is rejected even though 15 and 5 are each individually legal values. That is why `maxQuestionsFor()` must read `DURATION_OPTIONS` rather than existing as a separate `switch` that can drift.

`difficulty` is the odd one out: the column accepts any non-empty text, so nothing verifies whatever this story picks. That is not an oversight — Architecture §4's constraint notes state the rule "constrain only what a planning document actually fixes", and no document fixes difficulty's values. Consequence: `lib/types/interview.ts` becomes the **only** definition of the difficulty value set. Epic 3's prompt building must import it from there.

[Source: `docs/architecture.md#4-data-models`, `supabase/migrations/20260801000000_initial_schema.sql`]

### Why the selects must start empty

AC3 requires a reachable "you haven't chosen everything" state. If each select renders with its first real option preselected (the browser's default behaviour for a `<select>` with no empty option), the form is *never* incomplete and AC3 becomes untestable — the validation branch is dead code that looks implemented.

A disabled placeholder `<option value="">Select a role</option>` fixes this, and it also makes every choice deliberate: the difference between "the user wants Frontend" and "the user never looked at this field" is otherwise unrecoverable, and Epic 3 sends this straight into a paid AI call as interview context.

### Why `noValidate` — native `required` and React validation cannot both work

Setting `required` on a `<select>` makes the browser block submission and show its own bubble **before** React's `onSubmit` handler runs. The React validation you write would then never execute, and the `FormAlert` region would stay empty — the feature would look broken in exactly the way that is hardest to debug, because the browser bubble makes it look like it works.

Pick one. This story picks React, for three reasons: the error UI stays consistent with the accessible `FormAlert` / `aria-describedby` pattern the auth forms already established; browser bubbles cannot be styled or asserted on; and Stories 2.2 (file input) and 2.3 (textarea) need to join the *same* error model on this page.

Note this differs from `components/text-field.tsx`, which hardcodes `required`. That is correct there — those forms post to Server Actions that re-validate server-side, so native validation is a free extra layer, not the only one.

### Do not install `zod` yet

Architecture §2 lists `zod`, and §5 requires every API route to validate its input with it. This story has no API route and no server code — it is client state only. Installing a dependency the story never uses is the "wrong libraries" failure mode in reverse.

Design for it instead: exporting the option lists as `as const` arrays means Story 2.2/3.1 can write `z.enum(ROLES)` directly with no duplication. That is the reason for the `as const` requirement in Task 1, not stylistic preference.

### Reuse what already exists — read these three files first

`components/` already holds three components from Story 1.2's Task 4:

- `components/form-alert.tsx` — the `role="alert"` region. It owns its own React `key` via the `attempt` prop, so resubmitting the same bad input is re-announced by screen readers. Pass `attempt`; do not reimplement the keying.
- `components/submit-button.tsx` — full-width button with a pending label. It is deliberately **not** disabled internally because both auth forms wrap controls in `<fieldset disabled={pending}>`. Nothing here is async, so `pending={false}`; do not add a fieldset just for symmetry.
- `components/text-field.tsx` — the DOM/accessibility shape `SelectField` must mirror. Its doc comment states the rule this story follows: widen a shared component only when a caller genuinely needs a different shape.

`app/(auth)/register/page.tsx` is the layout reference: `<main className="flex min-h-screen items-center justify-center p-8">`, a `space-y-4` form, an `<h1 className="text-xl font-semibold">`. Match it. A max-width wider than `max-w-sm` is reasonable for five fields plus (later) a textarea — use judgement, but stay within the same visual language.

### Scope boundary — what belongs to a later story

Epic 2's scope note is explicit: these three stories cover **filling in and validating the intake form only**. The "Start Interview" click that creates the `interviews` row and generates question #1 is Story 3.1, because `POST /api/interviews` does both in one call.

So in this story:
- Nothing is written to Supabase. No `interviews` row is created.
- No API route, no `lib/ai/`, no Anthropic call, no `POST`.
- No resume upload (Story 2.2), no job description field (Story 2.3) — but leave the state object shaped so they slot in.
- No saved drafts, no `localStorage`, no URL query-param state. Reloading the page losing the form is acceptable at this stage.

A valid submit doing nothing user-visible is the correct outcome here. Say so plainly in the Completion Notes rather than inventing a placeholder success screen.

### Route protection is already handled

`proxy.ts` (Story 1.2) lists `/interviews` in `PROTECTED_PREFIXES` and matches by prefix (`pathname === route || pathname.startsWith(route + '/')`), so `/interviews/new` is protected the moment the page exists. Story 1.2's Dev Notes wrote the matcher for this route deliberately, before it existed.

Do not add a second auth check inside the page. Two guards for one rule drift apart, and the proxy's `getUser()` is the verified one — a page-level `getSession()` check would be strictly weaker.

Related: `deferred-work.md` notes the proxy matcher has no `/api/*` carve-out. Not this story's problem — no API route lands here.

### Next.js 16 notes that matter here

- This project runs Next.js 16.2.10 with React 19.2.4. Pages are Server Components **by default**; `'use client'` is required for `useState` and `onChange`. [Source: `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`]
- This story does **not** need `useActionState`. That hook exists to surface errors returned by a Server Action; there is no server call here, so plain `useState` is correct and simpler. Do not copy the auth pages' `useActionState` wiring reflexively. [Source: `node_modules/next/dist/docs/01-app/02-guides/forms.md#validation-errors`]
- Remember `middleware.ts` does not exist in this version — it is `proxy.ts`. You are not editing it, but do not "helpfully" create a middleware file.

### Testing

No automated test suite for this MVP (Architecture §8, `project-context.md`). Verify manually in this order — the first step is the one most likely to fail silently:

1. **Reachability + protection:** logged out, visit `/interviews/new` → redirected to `/login`. Then log in and click through from the dashboard link → the page loads. Observe both redirects; do not infer them.
2. **AC1:** all five selectors render, each showing its placeholder with nothing preselected, and each list contains exactly the documented values in the documented spelling. Read the option text against the `check` constraints above, character by character — this is the check that prevents a `23514` in Epic 3.
3. **AC3 before AC2:** submit immediately with everything empty → validation messages appear, nothing proceeds. Then fill four of five and submit → still blocked, with the message pointing at the missing field.
4. **AC2:** select each duration in turn and read the displayed question count: 15→3, 30→5, 45→7, 60→9. All four, not just one.
5. **Valid submit:** all five chosen → the console payload shows the five values plus the matching `max_questions`, and the page does not navigate.
6. **Regression:** `/login`, `/register`, and `/dashboard` still work after Task 4's dashboard edit, and registration still succeeds. Task 4 touches a file Story 1.1 owns.
7. `npm run build` and `npm run lint` clean before marking done — Stories 1.2 and 1.3 both recorded these.

### Project Structure Notes

- `app/interviews/new/page.tsx` matches Architecture §3's tree exactly (`interviews/new/page.tsx  # create form + resume upload`). No variance.
- `lib/types/interview.ts` is the first file in `lib/types/`, which Architecture §3 specifies but Story 1.3 explicitly left unused ("stays unused until an epic that queries these tables needs shared TypeScript types"). This is that point.
- `components/select-field.tsx` sits alongside the three existing components. Architecture §3: `components/  # reusable UI components`.
- `app/dashboard/page.tsx` is modified, not created. It remains a placeholder — Story 5.1 owns real dashboard content.
- No migration, no schema change, no `.env` change.

### References

- [Source: `_bmad-output/planning-artifacts/epics.md#Story-2.1`] — AC source, and the Epic 2 scope note drawing the line at Story 3.1
- [Source: `_bmad-output/planning-artifacts/epics.md#Functional-Requirements`] — FR2 (the five parameters), FR10 (the duration→question mapping)
- [Source: `docs/architecture.md#4-data-models`] — the live `check` constraints these values must satisfy; the rationale for `difficulty` being unconstrained
- [Source: `docs/architecture.md#3-source-tree`] — `app/interviews/new/`, `lib/types/`, `components/`
- [Source: `docs/architecture.md#8-testing-strategy`] — manual verification only
- [Source: `supabase/migrations/20260801000000_initial_schema.sql`] — the applied DDL
- [Source: `_bmad-output/implementation-artifacts/1-2-user-login.md`] — `components/` extraction discipline, the `proxy.ts` protected-prefix design, and the "verify by observing, not assuming" testing rule
- [Source: `_bmad-output/implementation-artifacts/1-3-database-schema-rls-setup.md`] — the `level = 'Mid'` incident; `lib/types/` deferred to the first consuming story
- [Source: `_bmad-output/implementation-artifacts/deferred-work.md`] — unreachable-route precedent (`/register` had no entry point); the proxy's missing `/api/*` carve-out
- [Source: `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`] — `'use client'` required for state and event handlers
- [Source: `node_modules/next/dist/docs/01-app/02-guides/forms.md`] — client vs server validation; `useActionState` is for Server Action errors

## Dev Agent Record

### Agent Model Used

claude-opus-5

### Debug Log References

**2026-08-14 — build and lint.** `npm run build` compiled successfully, TypeScript passed. The route table lists `○ /interviews/new` (prerendered static) and still shows `ƒ Proxy (Middleware)`, confirming `proxy.ts` is still picked up after this story's changes. `npm run lint` clean, no warnings.

**2026-08-14 — AC3 route protection, logged out (`curl`, no cookies).** The `/interviews` prefix rule was written by Story 1.2 before the route existed, so this is the first time it has actually been exercised:

| Path | Result |
|---|---|
| `/interviews/new` | `307` → `http://localhost:3000/login` ✅ |
| `/dashboard` | `307` → `http://localhost:3000/login` ✅ |
| `/login` | `200`, no redirect (no loop) ✅ |
| `/register` | `200`, no redirect (no loop) ✅ |

**2026-08-14 — AC1 verified against the server-rendered markup.** Parsed `.next/server/app/interviews/new.html` (the page is prerendered static, so this is the exact HTML the browser receives before hydration) rather than eyeballing a screenshot. All five selects present, in the AC1 order, each with:

| Field | Option values | Placeholder first, `disabled` + `selected` |
|---|---|---|
| Role | `Frontend`, `Backend`, `Fullstack`, `Mobile`, `DevOps` | ✅ "Select a role" |
| Experience level | `Intern`, `Fresher`, `Junior`, `Middle` | ✅ "Select your experience level" |
| Interview type | `Technical`, `Behavioral`, `Mixed` | ✅ "Select an interview type" |
| Difficulty | `Easy`, `Medium`, `Hard` | ✅ "Select a difficulty" |
| Duration | `15`, `30`, `45`, `60` (labels "15 minutes" …) | ✅ "Select a duration" |

Also asserted in the same pass: no `required` attribute on any select; `novalidate` present on the `<form>`; **no** "This interview will have …" line on load (correct — no duration chosen yet); **no** error text on load. The `disabled`+`selected` placeholder is the concrete evidence for the AC3 precondition — nothing is preselected, so "not all fields selected" is a reachable state rather than dead code.

**2026-08-14 — option values checked against the live schema's constraints.** The highest-risk failure this story can cause is a string that TypeScript accepts and Postgres rejects at `insert` time in Epic 3 (SQLSTATE `23514`), which is what happened to Story 1.3 with `level = 'Mid'`. So the values were diffed programmatically against `supabase/migrations/20260801000000_initial_schema.sql` rather than read by eye:

```
PASS  role enum matches DB            ["Frontend","Backend","Fullstack","Mobile","DevOps"]
PASS  level enum matches DB           ["Intern","Fresher","Junior","Middle"]
PASS  interview_type enum matches DB  ["Technical","Behavioral","Mixed"]
PASS  (duration_minutes, max_questions) pairs match DB   [[15,3],[30,5],[45,7],[60,9]]
PASS  difficulty unconstrained in DB, so the TS list is its only definition
```

The pairs check matters more than four independent value checks: the constraint is `check ((duration_minutes, max_questions) in ((15,3),…))`, evaluated as a **pair**, so `{15, 5}` is rejected even though 15 and 5 are each individually legal. `maxQuestionsFor()` reads the same table the diff compares, so the two cannot drift apart without this check failing.

(First run of the checker reported a false FAIL on the pairs line — a lazy regex in the *checker* stopped at the first `))` and dropped `(60,9)`. Fixed in the checker; the code under test was never wrong. Recorded because a verification script that can report a false failure can equally report a false pass.)

**2026-08-14 — live browser verification of AC2 and AC3.** Both are hydrated client behaviour on a route behind the proxy, so they need a real session. The user signed in; the agent drove the checks in that tab. All results below are observed, not inferred.

*Route protection, in the browser this time.* Navigating to `/interviews/new` while logged out landed on `/login` — the same result as the `curl` table above, but through a real browser with cookie handling. Worth recording separately: the browser tool reports the URL it was *asked* for, so the redirect is only visible by reading the tab's final URL afterwards. Reading the requested URL as the result would have produced a false PASS here.

*Task 4 + Story 1.1 regression.* Registering landed on `/dashboard`, which rendered the placeholder text plus the new "Start a new interview" link. Clicking it reached `/interviews/new`. So the dashboard edit did not break registration, and the page is reachable without typing a URL.

*AC1, live.* All five comboboxes hydrated with their full option lists and each placeholder still `(selected)` — matching the prerendered markup exactly, i.e. hydration did not change any initial value.

*AC3 — submit with every field empty.* Five per-field messages rendered ("Please select a role." … "Please select a duration.") plus the summary "Please choose a value for every field before starting.", and the URL did not change.

That visual result alone would not prove "cannot continue" — it only shows messages appeared. So the check was repeated on a freshly reloaded form with the console cleared first: clicking **Start Interview** on the empty form produced **zero** `[new-interview]` console entries. The handler returns before reaching the payload, rather than proceeding quietly behind a red message.

*AC2 — all four durations, not one.*

| Duration selected | Rendered line |
|---|---|
| 15 minutes | "This interview will have 3 questions." ✅ |
| 30 minutes | "This interview will have 5 questions." ✅ |
| 45 minutes | "This interview will have 7 questions." ✅ |
| 60 minutes | "This interview will have 9 questions." ✅ |

*Error-clearing behaviour.* Choosing a duration while the other four errors were showing removed only "Please select a duration." and left the rest — confirming validation re-runs per change after the first failed submit, and that it is per-field rather than all-or-nothing.

*Concurrent state updates.* The remaining four fields were set in a single batch, deliberately, because `update()` builds the next state from the `intake` closure (`{...intake, [key]: value}`) rather than `setIntake(prev => …)`. Four programmatic changes in quick succession is the shape that would expose a stale-closure clobber. All four landed: every error message cleared, and a subsequent read showed `Frontend` / `Junior` / `Technical` / `Medium` / `60 minutes` all `(selected)`. No update was lost.

*Valid submit.* Exactly one `[new-interview] intake complete` console entry, and the URL stayed on `/interviews/new` — nothing navigates and nothing is persisted, which is the correct end state until Story 3.1. The browser console renders the payload collapsed as `Object`, so the field values were confirmed from the controlled selects' DOM state (listed above) rather than from the log line; the `max_questions` half is covered by the rendered "9 questions" line plus the contract check against the migration.

### Completion Notes List

- **Deviation from the workflow's red-green-refactor steps.** This project has no automated test suite by design (Architecture §8, `project-context.md`, and this story's own Testing section). Steps 5–7's TDD cycle was satisfied by build/lint, static verification of the rendered markup, a contract check against the migration, and live browser checks — not by unit tests. Flagged explicitly rather than silently skipped, same as Story 1.2.
- **`SelectField` gained one prop beyond the story's list: `formatLabel`.** The duration selector needs value `15` with label "15 minutes", and the story requires the label/value split to stay in the page. An optional formatter passed *from* the page satisfies both, and keeps `options` a plain `readonly string[]` for the other four callers.
- **`SelectField` renders its own error text rather than reusing `FormAlert`.** Five fields can be wrong simultaneously, so "which field?" has to sit next to the field. Those messages are plain text wired by `aria-describedby`, not `role="alert"` — five live regions announcing at once is noise. The page's single `FormAlert` remains the one live region.
- **Validation runs only after the first submit attempt.** Validating from the first interaction would show "please select a role" on a form the user has barely started. After a failed submit, every change re-validates, so a fixed field's error clears immediately instead of lingering.
- **The `console.log` on a valid submit is temporary.** It exists so the derived `max_questions` is observable in the browser. Story 3.1 replaces it with `POST /api/interviews`; the comment above it says so.
- **No `zod`, no new dependencies at all.** The option lists are `as const` arrays so Story 2.2/3.1 can write `z.enum(ROLES)` with no duplication.
- **`proxy.ts` was not touched.** `/interviews` was already in `PROTECTED_PREFIXES`, written that way by Story 1.2 before the route existed. Confirmed by observation (see Debug Log), not assumed.
- **Verification split between agent and user.** AC1 and the option/constraint contract were verified by the agent without any session (prerendered markup + a diff against the migration). The two interactive ACs needed a logged-in browser: the user registered and signed in, then the agent drove the checks. The agent did not create the account or enter the password.
- **One throwaway account was added to the live Supabase project** during that step, joining the three Story 1.3 left behind. `deferred-work.md` already tracks "verification data was seeded into the live Supabase project, and there is no staging project" — this adds to it rather than introducing a new problem, but it is one more row to clean up when a staging project exists.
- **`update()` builds the next state from a closure, not `setIntake(prev => …)`.** Left as-is because the batched four-field test showed no lost updates (see Debug Log), and React processes real user events with a render between them. Worth knowing if a future story ever updates several intake fields programmatically in one tick — e.g. Story 2.2 filling both `resumeText` and a status flag after the parse call returns. That is the shape that would break it.

### File List

- `lib/types/interview.ts` (new)
- `components/select-field.tsx` (new)
- `app/interviews/new/page.tsx` (new)
- `app/dashboard/page.tsx` (modified — added the link to `/interviews/new`)
- `_bmad-output/implementation-artifacts/2-1-select-interview-parameters.md` (modified — this file)

## Change Log

| Date | Change |
| --- | --- |
| 2026-08-13 | Story created. Status: ready-for-dev. |
| 2026-08-14 | Tasks 1–4 implemented: shared intake option lists in `lib/types/interview.ts`, reusable `SelectField`, the New Interview form, and a dashboard entry point. `npm run build` and `npm run lint` clean. AC1 verified against the prerendered markup; all five option sets verified byte-identical to the migration's `check` constraints. Status: in-progress pending live confirmation of AC2/AC3. |
| 2026-08-14 | AC2 and AC3 verified live in the browser: all four duration→question mappings rendered correctly, empty submit blocked with per-field messages and produced zero log entries, valid submit logged once and did not navigate. Route protection and the registration regression re-confirmed through a real browser. Status: review. |
| 2026-08-14 | Code review (Blind Hunter, Edge Case Hunter, Acceptance Auditor): no AC violations. 3 patches applied — `<fieldset>` double-submit guard, `aria-required` on selects, and a non-throwing guard around the render-time duration→question lookup. 5 items deferred to `deferred-work.md` (difficulty enum has no enforcement anywhere; `SelectField.options` typing allows an unvalidated cast, real fix already planned for Story 3.1's `zod` work; generic vs per-field a11y alert wording; the temporary `console.log` as a precedent for later stories; no cancel link). `npx tsc --noEmit` and `npx eslint` clean. Status: done. |
| 2026-08-14 | Re-review, round 2: the round-1 "non-throwing lookup" patch had introduced a second reader of `DURATION_OPTIONS`, which the round-2 Acceptance Auditor correctly flagged as violating this file's own "one table, one reader" rule — reverted to calling `maxQuestionsFor()` directly (verified safe: TypeScript narrows `durationMinutes` past the `!== ''` guard, confirmed with a standalone `tsc` check). 2 new items deferred (no focus management after a failed submit, matching the existing auth forms' gap; no double-submit guard, harmless until Story 3.1 makes submit async). No new patches needed. `npx tsc --noEmit` and `npx eslint` clean. Status remains: done. |
