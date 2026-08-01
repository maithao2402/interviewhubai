---
baseline_commit: 847b3d72bfa0d3f06f88d5a520734334dea3ce90
---

# Story 1.3: Database Schema & RLS Setup

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the system,
I need the database schema in place with RLS,
so that each user's interview data is isolated and structured correctly.

## Acceptance Criteria

1. **Given** the Supabase project is set up, **when** the migration is applied, **then** the `interviews`, `questions`, and `answers` tables exist, matching the Architecture §4 schema exactly (column names, types, constraints).
2. **Given** RLS is enabled, **when** an authenticated user queries `interviews`, **then** only rows where `user_id = auth.uid()` are returned.
3. **Given** RLS is enabled, **when** an authenticated user queries `questions` or `answers`, **then** only rows belonging to interviews they own (via the `interview_id` join) are returned.
4. **Given** a request is unauthenticated, **when** it attempts to query any of the three tables directly, **then** no rows are returned (RLS blocks anonymous access).

## Tasks / Subtasks

- [x] Task 1: Write the schema migration SQL (AC: #1)
  - [x] Create `supabase/migrations/20260801000000_initial_schema.sql` — this repo has no `supabase/` folder yet; create it. The filename timestamp prefix is the Supabase CLI convention (`YYYYMMDDHHMMSS_description.sql`), kept for version-control documentation even though this story applies the SQL manually (see Task 3)
  - [x] Copy the three `create table` statements from Architecture §4 **verbatim** — column names, types, and constraints must match exactly, since AC1 is checked against that section, not against judgment calls made here
  - [x] Order the statements `interviews` → `questions` → `answers` (each later table's foreign key references the one before it; reverse order fails at creation time)
  - [x] Do **not** create a Supabase Storage bucket — resume files are transient and never persisted (NFR3, Architecture §4's own note)
- [x] Task 2: Enable RLS and add ownership policies to the same migration file (AC: #1 groundwork, #2, #3, #4)
  - [x] `alter table ... enable row level security;` for all three tables
  - [x] One policy per table, using `for all` (not just `select`) — see Dev Notes for why this matters even though the ACs only describe `select` behavior
  - [x] `interviews`: `using (auth.uid() = user_id) with check (auth.uid() = user_id)`
  - [x] `questions`: `using`/`with check` an `exists` subquery joining `interviews` on `interviews.id = questions.interview_id and interviews.user_id = auth.uid()`
  - [x] `answers`: `using`/`with check` an `exists` subquery joining `questions` → `interviews` on `questions.id = answers.question_id and interviews.id = questions.interview_id and interviews.user_id = auth.uid()`
- [x] Task 3: Apply the migration to the real Supabase project (AC: #1)
  - [x] **Manual step (user, not agent):** open the Supabase Dashboard for the same project used in Stories 1.1/1.2 → SQL Editor → paste the full contents of the migration file → run it — **done by user 2026-08-01**
  - [x] Verify in Table Editor: `interviews`, `questions`, `answers` exist with the exact columns from Architecture §4, and each table's RLS toggle shows "Enabled" — verified programmatically instead of visually, see Debug Log (stronger evidence than the dashboard view: exact column set, defaults, NOT NULL, and cascade all asserted)
- [x] Task 4: Verify RLS behavior with real requests (AC: #2, #3, #4)
  - [x] Create two fresh throwaway accounts via the existing `/register` page (User A, User B) — do not reuse or assume any existing account's credentials; none are recorded in this repo — created via `POST /auth/v1/signup` (the same call `/register`'s Server Action makes), see Debug Log for why
  - [x] For each user, get a real access token: `POST {SUPABASE_URL}/auth/v1/token?grant_type=password` with header `apikey: <anon key>`, body `{"email":...,"password":...}` → read `access_token` from the response
  - [x] As User A, insert one `interviews` row, then one `questions` row under it, then one `answers` row under that question — via `POST {SUPABASE_URL}/rest/v1/<table>` with headers `apikey: <anon key>` and `Authorization: Bearer <User A's access_token>` (see Dev Notes for the `user_id` field requirement and an example payload)
  - [x] Repeat for User B, so both users own data in all three tables
  - [x] As User A's token, `GET /rest/v1/interviews` → confirm only User A's row is returned, not User B's (AC2) — this is the real test; a single-user check would pass even with a broken policy
  - [x] As User A's token, `GET /rest/v1/questions` and `GET /rest/v1/answers` → confirm only rows under User A's interview are returned (AC3)
  - [x] Using only the anon key with **no** user token (`Authorization: Bearer <anon key>` itself, not omitted — see Dev Notes), `GET` all three endpoints → confirm each returns an empty array (AC4)

### Review Findings

Code review 2026-08-01 (Blind Hunter + Edge Case Hunter + Acceptance Auditor). Severity reflects consequence for this project, re-rated after live verification against the Supabase project — several reviewer claims were downgraded or upgraded on evidence. Verification transcript summarised in Debug Log References.

- [x] [Review][Decision] **[high] `interviews.user_id` FK has no `on delete` rule, so deleting an auth user is blocked rather than cascaded** — `user_id uuid references auth.users not null` defaults to `NO ACTION`, so `delete from auth.users` raises `23503` while the user owns any `interviews` row. Account deletion via the dashboard or `auth.admin.deleteUser` fails outright. Fixing it means `on delete cascade` in Architecture §4, which AC1 pins verbatim — needs your call on amending the architecture doc.
- [x] [Review][Decision] **[medium] A signed-in user can overwrite their own AI-generated scores and feedback** — confirmed live: `PATCH /rest/v1/answers?id=eq.<own row>` with `{"overall_score":10,"feedback":"self-written"}` returned `200` and stored the values. The `for all` policies check ownership only, and there is no `service_role` writer to fall back on, so every write is a user write. Options: column-level `GRANT`s, a separate narrower `update` policy, or a trigger.
- [x] [Review][Decision] **[medium] No uniqueness on `answers.question_id` — duplicate answers are storable** — confirmed live: a second answer for the same question inserted successfully. Architecture §6.1 rebuilds AI context as *alternating* assistant/user turns; two answers for one question produce two consecutive user turns, which the Anthropic Messages API rejects. A double-click on Submit could make an interview permanently unresumable in Epic 3.
- [x] [Review][Decision] **[medium] No uniqueness on `(questions.interview_id, order_index)`** — confirmed live: two questions accepted `order_index = 1`. `order by order_index` then has no tiebreaker, so question order can differ between requests and the replayed conversation can silently reorder.
- [x] [Review][Decision] **[medium] No CHECK constraints on numeric or enumerated columns** — confirmed live: `technical_score` accepted both `"NaN"` and `-999`. `NaN` poisons every `AVG()`/`SUM()` for that user. Also unconstrained: `status`, `level`, `interview_type`, `difficulty` (a typo like `'complete'` writes fine and drops the row from dashboard filters), and `duration_minutes` / `max_questions` (`0` or negative values are storable).
- [x] [Review][Decision] **[medium] No repeatable RLS verification exists in the repo** — RLS is this application's only security control, and the scripts that verified it were throwaway. No future migration, policy edit, or Supabase upgrade can be regression-checked. Keeping a small `scripts/verify-rls.mjs` would not violate the "no automated test suite" rule in project-context, but it is your call.
- [x] [Review][Decision] **[low] `created_at` is nullable on all three tables** — confirmed live: an explicit `"created_at": null` in the payload is stored as NULL, because a `default` only applies when the column is omitted. `order by created_at desc` sorts NULLS FIRST, so such a row pins itself to the top of a newest-first list.
- [x] [Review][Decision] **[low] `questions.interview_id` and `answers.question_id` are nullable** — reviewers rated this Medium; downgraded after testing. Confirmed the normal path is already closed: an insert with a null FK is rejected `403 / 42501` by RLS, not by a not-null constraint. Orphans are only reachable through the SQL Editor or a future `service_role` path, where they would be invisible and undeletable via the API.
- [x] [Review][Patch] Completion Notes give cleanup steps in an order that will fail — deleting the `schema-check` auth user is blocked by the FK while its `interviews` row exists; the row must go first, via SQL Editor [_bmad-output/implementation-artifacts/1-3-database-schema-rls-setup.md]
- [x] [Review][Patch] Debug Log asserts the `interviews → questions → answers` cascade on anon-`GET []` evidence, which proves nothing — the exact trap the same document warns about two entries earlier [_bmad-output/implementation-artifacts/1-3-database-schema-rls-setup.md]
- [x] [Review][Patch] AC1's "types" clause was reported PASS, but comparing a returned JSON row cannot observe column types [_bmad-output/implementation-artifacts/1-3-database-schema-rls-setup.md]
- [x] [Review][Patch] The `with check` anti-ownership-reassignment claim and the anon-write threat surface were asserted but never tested; policies are `for all` while only SELECT and INSERT were exercised [_bmad-output/implementation-artifacts/1-3-database-schema-rls-setup.md]
- [x] [Review][Patch] File List marks the story file `(modified)` when it is a new untracked file [_bmad-output/implementation-artifacts/1-3-database-schema-rls-setup.md]
- [x] [Review][Patch] Migration is not wrapped in a transaction — a partial paste into the SQL Editor can leave a table created and live in PostgREST with RLS not yet enabled, or enabled with zero policies [supabase/migrations/20260801000000_initial_schema.sql]
- [x] [Review][Defer] `auth.uid()` is called per row instead of `(select auth.uid())`, the documented Supabase RLS performance anti-pattern [supabase/migrations/20260801000000_initial_schema.sql:81] — deferred, pre-existing
- [x] [Review][Defer] Policies are not scoped `to authenticated`, so anonymous requests execute the full `exists` join to be told `[]` [supabase/migrations/20260801000000_initial_schema.sql:79] — deferred, pre-existing
- [x] [Review][Defer] Policy expressions query `interviews`/`questions`, which are themselves RLS-protected — an undocumented coupling that breaks silently if a restrictive policy is added later [supabase/migrations/20260801000000_initial_schema.sql:92] — deferred, pre-existing
- [x] [Review][Defer] No indexes on `questions.interview_id` / `answers.question_id`, which every RLS `exists` lookup and every cascade delete scans [supabase/migrations/20260801000000_initial_schema.sql:38] — deferred, pre-existing
- [x] [Review][Defer] Migration is not idempotent — no `if not exists` or `drop policy if exists`, so a second run fails partway [supabase/migrations/20260801000000_initial_schema.sql:16] — deferred, pre-existing
- [x] [Review][Defer] No migration history table or checksum, so drift between this file and the live database is undetectable [supabase/migrations/20260801000000_initial_schema.sql] — deferred, pre-existing
- [x] [Review][Defer] `supabase/migrations/` follows a CLI naming convention for a CLI that is never installed [supabase/migrations/20260801000000_initial_schema.sql] — deferred, pre-existing
- [x] [Review][Defer] `strengths`/`weaknesses`/`roadmap` accept any JSON value, so `"text"` or `42` is storable where an array is expected [supabase/migrations/20260801000000_initial_schema.sql:29] — deferred, pre-existing
- [x] [Review][Defer] Verification seeded and left data in the live Supabase project shared with Stories 1.1/1.2; there is no staging project [_bmad-output/implementation-artifacts/1-3-database-schema-rls-setup.md] — deferred, pre-existing
- [x] [Review][Defer] Dev Notes suggest pasting a live production access token into a third-party web JWT debugger [_bmad-output/implementation-artifacts/1-3-database-schema-rls-setup.md:71] — deferred, pre-existing (Dev Notes is not a section dev-story may edit)

### Review Findings — Round 2

Code review 2026-08-01, second round, over the hardening changes themselves (Architecture §4 v0.2, the updated migration, `scripts/verify-rls.mjs`, `package.json`). Three parallel layers again. **The verification script written in round 1 is the single largest risk in this diff** — a test harness that can pass while the system is broken is worse than no harness, and one of its defects can destroy data.

- [x] [Review][Patch] **[critical] `wipe()` issues an unbounded `DELETE` whose only bound is the RLS it exists to test** — `DELETE /rest/v1/interviews?id=not.is.null` with no `user_id` filter, run twice *before* any assertion. If a migration ever drops or weakens the `interviews` policy — the exact regression this script exists to catch — the first thing `npm run verify:rls` does is delete every interview row in the project, cascading to all questions and answers, and only then report the failure. Fix: filter client-side with `?user_id=eq.<id>` so the bound never depends on the thing under test [scripts/verify-rls.mjs]
- [x] [Review][Patch] **[high] Nine assertions accept any HTTP ≥ 400 as proof of the specific mechanism named in their label** — the SQLSTATE is captured into the detail string and never compared. Drop the `technical_score` column and `"score negative/above 10/NaN is rejected"` all still PASS on a `PGRST204 column not found`, with no range constraint anywhere. Assert the code (`23514`, `23505`, `23502`, `42501`) [scripts/verify-rls.mjs]
- [x] [Review][Patch] **[high] `insert without user_id is rejected` sits under `Schema constraints` but proves RLS, not `not null`** — this story's own Debug Log records the response as `403 / 42501`, i.e. the `with check` clause rejects it before any not-null constraint is reached. The check passes identically on a schema where `user_id` is nullable [scripts/verify-rls.mjs]
- [x] [Review][Patch] **[high] Absence assertions pass when the request itself fails** — `ids()` returns `[]` for a null or error body, so `!ids(...).includes(x)` is `true` on a 401, a 500, or a network error. All three "A does not see B's ..." lines print PASS against a completely broken API [scripts/verify-rls.mjs]
- [x] [Review][Patch] **[high] The cascade check cannot distinguish "deleted" from "invisible", and passes vacuously** — it re-reads through RLS, so orphaned children whose parent is gone evaluate the `exists` subquery to false and read as `[]`. PostgREST also returns `204` for a DELETE matching zero rows, so a cascade that never ran reports PASS. Use `Prefer: return=representation` to confirm a row was actually deleted [scripts/verify-rls.mjs]
- [x] [Review][Patch] **[high] Roughly half of §4 v0.2's constraints are never exercised, and `on delete cascade` on `user_id` cannot be** — untested: the `role`, `interview_type`, and `status` enums; `max_questions > 0`; `order_index >= 0`; `not null` on both foreign keys and on `interviews.created_at` / `answers.created_at`; three of the four score columns. `on delete cascade` needs dashboard or `service_role` access the script does not have — the highest-severity finding from round 1 has no automated check at all [scripts/verify-rls.mjs]
- [x] [Review][Patch] **[high] Concurrent runs corrupt each other** — the two accounts are fixed constants with no run scoping and no lock, so a CI run and a local run overlapping means one `wipe()` deletes the other's seed mid-flight, and both report spurious isolation failures [scripts/verify-rls.mjs]
- [x] [Review][Patch] **[high] Credentials are hardcoded, violating an explicit project rule** — `project-context.md` and Architecture §7 both state "never hardcode secrets — always read from `process.env`". The script hardcodes two account passwords and hand-parses `.env.local` with `readFileSync` instead of reading `process.env`. The "not secrets, dev project only" comment is contradicted by this story's own record: there is no staging project, and the signup endpoint is publicly reachable with the browser-shipped anon key [scripts/verify-rls.mjs]
- [x] [Review][Patch] **[medium] No request timeout anywhere** — a free-tier Supabase project auto-pauses after inactivity, which is exactly the state a verification script meets. The paused project accepts the connection and never responds; the script hangs with no output and no exit code [scripts/verify-rls.mjs]
- [x] [Review][Patch] **[medium] `wipe()` ignores its own response, and nothing cleans up on a throw** — a failed pre-run wipe leaves stale rows and every exact-count assertion then fails, reading as an isolation breach rather than a reset failure. Any throw between seeding and cleanup leaves both users' rows in the live project, contradicting the header comment's promise [scripts/verify-rls.mjs]
- [x] [Review][Patch] **[medium] `loadEnv` breaks on standard dotenv syntax and has no `process.env` fallback** — a quoted `NEXT_PUBLIC_SUPABASE_URL="https://..."` yields a URL with literal quotes and an opaque "Failed to parse URL"; a trailing slash produces `//rest/v1/...` 404s that surface as a wall of unrelated failures [scripts/verify-rls.mjs]
- [x] [Review][Patch] **[medium] The wrong-password path prints an unrelated diagnosis** — if the accounts exist with a different password, sign-in fails and signup returns "User already registered"; the thrown message tells the developer to change an email-confirmation setting on a live project [scripts/verify-rls.mjs]
- [x] [Review][Patch] **[medium] Score boundary values 0 and 10 are never tested as accepted** — the loop only tests rejection. `between 0 and 10` is inclusive, but a constraint mistakenly written `> 0 and < 10` would report full pass while silently rejecting every legitimate boundary score from FR8 [scripts/verify-rls.mjs]
- [x] [Review][Patch] **[medium] The Anthropic API justification for `answers.question_id unique` is factually wrong** — §4's note and this story both claim two consecutive user turns are "rejected by the Anthropic Messages API". Verified against the current API reference: consecutive same-role messages are **allowed and combined into a single turn**. (An older error-code table still lists the 400; the current SDK reference contradicts it.) The constraint is still justified — duplicate answers corrupt the score average and make "the answer for this question" nondeterministic — but the stated reason must be replaced, not repeated [docs/architecture.md]
- [x] [Review][Patch] **[medium] "27/27 PASS" does not match the script** — the committed script emits **28** check lines (two of the 24 call sites are inside loops of three). Recounted against the recorded run output: 28. The figure appears in the Debug Log and the Change Log [_bmad-output/implementation-artifacts/1-3-database-schema-rls-setup.md]
- [x] [Review][Patch] **[medium] The record overclaims the script's coverage twice** — "asserts every AC plus the constraints added in §4 v0.2" and "Every AC re-confirmed, plus **each** constraint". Neither is true (see the coverage finding above), and the claim that error codes prove "which mechanism did the rejecting" describes something the script never asserts [_bmad-output/implementation-artifacts/1-3-database-schema-rls-setup.md]
- [x] [Review][Patch] **[medium] The AC1 verbatim-diff evidence is stale and no longer reproduces** — the recorded `sed -n '60,99p'` / `'16,55p'` ranges describe the pre-v0.2 files and now exit 1; the DDL block moved to doc lines 61–101 and migration lines 24–64. The property still holds (re-verified), but the cited command does not support it [_bmad-output/implementation-artifacts/1-3-database-schema-rls-setup.md]
- [x] [Review][Patch] **[medium] §4's not-null-FK note states a failure mode this story's own testing refuted** — it claims a null FK makes rows "invisible and undeletable through the API", framed as a defect found by review. Live testing found the opposite: a null-FK insert is rejected `403 / 42501` by RLS. The constraint is sound defence-in-depth; the justification is not what was observed [docs/architecture.md]
- [x] [Review][Patch] **[low] The Change Log misattributes the `status` enum to FR2/FR8** — FR8 fixes no enumeration at all (only the 0–10 scale), and `'completed'` originates in Epic 4 Story 4.1 / Epic 5 Story 5.2, not Epic 3 [docs/architecture.md]
- [x] [Review][Patch] **[low] The score-forgery limitation is documented only in a SQL comment** — §4's new "Constraint notes" block reads as though the hardening pass closed everything it found, while the confirmed-live finding that a user can set their own `overall_score` to 10 lives only inside a file applied once by hand [docs/architecture.md]
- [x] [Review][Patch] **[low] `scripts/` is undocumented** — added as a new top-level folder without an entry in Architecture §3's source tree, and the story's Project Structure Notes still assert no files outside `supabase/` change [docs/architecture.md]
- [x] [Review][Patch] **[low] The deferred index item is now stale and points at the wrong columns** — the new `unique` constraints implicitly created indexes on `questions.interview_id` (as part of the composite) and `answers.question_id`, resolving that deferred item by accident. The index that actually matters is still missing: `interviews.user_id`, which every `interviews` RLS evaluation, the history list, and every `auth.users` cascade delete filters on [_bmad-output/implementation-artifacts/deferred-work.md]
- [x] [Review][Decision] **[high] The two-value `status` enum forbids a state Epic 4 requires** — Story 3.3 AC2 finishes the session before a report exists; Story 4.1 AC2 sets `'completed'` only after report generation succeeds and demands "a way to retry report generation manually, instead of my interview being permanently stuck with no report"; NFR1 allows the AI call to fail permanently after retries. With only `in_progress`/`completed`, a finished-but-unreported interview must sit at `in_progress`, and Story 5.2 AC3 then hides it from every screen — the retry path Story 4.1 requires becomes unreachable. Neither value is enumerated in any planning doc; both were inferred.
- [x] [Review][Decision] **[medium] `interviews.overall_score between 0 and 10` invents a scale no document defines** — FR8's 0–10 covers only the three per-answer criteria ("each scored 0–10"). FR11, Story 4.1 AC1, and the PRD all say "overall score" with no range. This is the same situation that justified leaving `difficulty` unconstrained, applied inconsistently. If Epic 4 emits a 0–100 overall score, the write fails `23514` *after* a completed AI call — the "stuck with no report" outcome Story 4.1 rules out.
- [x] [Review][Decision] **[medium] `max_questions > 0` omits the enumeration FR10 does define** — FR10 and Story 2.1 AC2 fix the mapping 15→3, 30→5, 45→7, 60→9. The partner column was enumerated; this one was left open, so `{duration_minutes: 15, max_questions: 9999}` is storable — a combination FR10 forbids, and one that would drive an unbounded number of paid Anthropic calls since every write goes through the user's own session.
- [x] [Review][Decision] **[medium] `order_index >= 0` admits a value the ACs never define** — Story 3.1 AC3 persists the first question with `order_index = 1`, and Story 3.3 AC1 ends the session when `order_index` reaches `max_questions`; both only terminate correctly on a 1-based sequence. `>= 0` lets a 0-based writer pass while the auto-end condition never fires. No upper bound ties it to `max_questions` either.
- [x] [Review][Decision] **[medium] `answers.question_id unique` forecloses the NFR1 retry path** — Architecture §5 has the answer route "persist the answer, call AI once to both evaluate it and generate the next question". If the answer is written first and evaluation exhausts its retries, re-submitting the same answer now returns `23505`; only an UPDATE recovers, and no route behaviour distinguishes the two. The constraint also turns a double-submit race into a hard `23505` with no mapping in §7's `{ error: string }` contract.
- [x] [Review][Decision] **[medium] `begin;`/`commit;` conflicts with the directory the file lives in** — the wrapper was added for the SQL-Editor paste path, but the file is named and located per the Supabase CLI convention, and `supabase db push` already wraps each migration in its own transaction: a nested `begin` warns and the explicit `commit` ends the outer transaction early, defeating the atomicity the comment claims. The file is written for one execution path while sitting in the directory of another.
- [x] [Review][Defer] `status`, `completed_at`, and `overall_score` are mutually unconstrained — `completed` with both others null is representable, as is `completed_at` set while `in_progress` [supabase/migrations/20260801000000_initial_schema.sql] — deferred, pre-existing
- [x] [Review][Defer] `not null` on `answer_text`, `content`, and `difficulty` still admits the empty string [supabase/migrations/20260801000000_initial_schema.sql] — deferred, pre-existing
- [x] [Review][Defer] Anonymous write tests cover only `interviews`; `questions` and `answers` have structurally different policies (subquery joins) and go untested for anon writes [scripts/verify-rls.mjs] — deferred, pre-existing
- [x] [Review][Defer] `with check` on `questions` and `answers` is never exercised — only `interviews.user_id` reassignment is tested [scripts/verify-rls.mjs] — deferred, pre-existing
- [x] [Review][Defer] `process.exit()` immediately after `console.log` can truncate the final verdict line on Windows when stdout is redirected [scripts/verify-rls.mjs] — deferred, pre-existing

## Dev Notes

### Why RLS policies must be `for all`, not just `select`

The ACs only describe `select` behavior, but the app never uses a `service_role` key — `.env.local` and `.env.example` only hold `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Every future write (Epic 2/3's `POST /api/interviews`, the answer-submission route) goes through the authenticated user's own session against the anon key, which means every insert/update is also RLS-checked. A `select`-only policy would let AC2–AC4 pass today but silently block every insert Epic 2/3 needs later, since RLS default-denies any operation with no matching policy. This is exactly the kind of gap that satisfies the letter of an AC while leaving the system unable to actually work end-to-end — write `for all` policies now.

### Why every insert must set `user_id` explicitly — there is no default

Architecture §4's `interviews` table has no `default` on `user_id` (unlike `id`, which defaults via `gen_random_uuid()`). This is deliberate: the `with check` clause is what proves an insert belongs to the caller, and it can only do that if the row states a `user_id` for the policy to compare against `auth.uid()`. A future API route must always set `user_id: user.id` itself (from `supabase.auth.getUser()`) — that is Epic 3's concern, not this story's, but Task 4's manual test inserts hit the same requirement: without `user_id` in the payload, the insert is rejected by the `with check` clause, not silently defaulted.

Example insert body for Task 4 (`POST /rest/v1/interviews`):
```json
{
  "user_id": "<the authenticated user's own auth.uid(), from the JWT's sub claim>",
  "role": "Frontend",
  "level": "Junior",
  "interview_type": "Technical",
  "difficulty": "Medium",
  "duration_minutes": 15,
  "max_questions": 3
}
```
Get the `sub` claim by decoding the `access_token` (any JWT decoder, e.g. paste into a JWT debugger, or `echo <token> | cut -d. -f2 | base64 -d`).

### RLS policy SQL reference

Architecture §4 says policies must scope to `auth.uid() = user_id`, "directly or via join through `interview_id`" — it does not give literal SQL, since that's this story's job. Use this exact shape (table names only — Task 1 already supplies the `create table` statements from Architecture §4):

```sql
alter table interviews enable row level security;

create policy "owner_full_access" on interviews
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table questions enable row level security;

create policy "owner_full_access" on questions
  for all
  using (
    exists (
      select 1 from interviews
      where interviews.id = questions.interview_id
        and interviews.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from interviews
      where interviews.id = questions.interview_id
        and interviews.user_id = auth.uid()
    )
  );

alter table answers enable row level security;

create policy "owner_full_access" on answers
  for all
  using (
    exists (
      select 1 from questions
      join interviews on interviews.id = questions.interview_id
      where questions.id = answers.question_id
        and interviews.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from questions
      join interviews on interviews.id = questions.interview_id
      where questions.id = answers.question_id
        and interviews.user_id = auth.uid()
    )
  );
```

`using` gates reads/updates/deletes; `with check` gates what a write is allowed to leave behind. Both are needed and must match — an `using`-only policy would let a malicious `update` reassign a row's ownership away from its real owner, since nothing checks the *resulting* row.

### `gen_random_uuid()` gotcha

Architecture §4's DDL calls `gen_random_uuid()` directly with no `create extension` line. Supabase projects normally have `pgcrypto` enabled by default, so this should just work — but if the SQL Editor errors with `function gen_random_uuid() does not exist`, run `create extension if not exists pgcrypto;` first and retry. Do not add this line to the migration file pre-emptively; only add it if the error actually occurs, so the file stays a faithful match to Architecture §4 (AC1).

### Testing an "unauthenticated" request correctly

"Unauthenticated" does not mean omitting the `Authorization` header — Supabase's API gateway expects one. It means sending the **anon key itself** as the bearer token (`Authorization: Bearer <anon key>`, same value as the `apikey` header), which decodes to the `anon` role. Under that role, `auth.uid()` evaluates to `null`, so `null = user_id` is never true for any row and every policy denies access — that null-comparison behavior is what makes AC4 hold without writing a separate anon-deny policy.

### Project Structure Notes

- `supabase/migrations/` is a new top-level folder not shown in Architecture §3's tree — same category of variance as `proxy.ts` in Story 1.2: required by tooling convention, not a design choice. No `supabase/config.toml` is created; this story doesn't set up the CLI, only a version-controlled copy of the SQL that's applied manually via the dashboard.
- No files under `app/`, `lib/`, or `components/` change in this story — it is pure schema/infrastructure. `lib/types/` (Architecture §3) stays unused until an epic that queries these tables needs shared TypeScript types.

### Out of scope (do not implement here)

- Generating Supabase's TypeScript types (`supabase gen types typescript`) — no story or AC requires it yet.
- Seed data beyond the throwaway test rows Task 4 creates for verification.
- Any API route or UI that reads/writes these tables — that starts at Epic 2/3.
- Indexes beyond what Architecture §4 specifies (it specifies none) — don't add speculative ones.

### Testing

No automated test suite for this MVP (Architecture §8). Task 4's curl-based verification against the real Supabase project **is** the test for this story — there is no application code to exercise otherwise. Run Task 4's checks in order (A's data first, then B's, then cross-check isolation, then anon) so a failure at any AC is caught before moving on, same discipline as Story 1.2's ordered manual test plan.

### References

- [Source: `_bmad-output/planning-artifacts/epics.md#Story-1.3`] — AC source
- [Source: `docs/architecture.md#4-data-models`] — exact table DDL to copy verbatim
- [Source: `docs/architecture.md#9-security`] — "RLS enabled on every table, no exceptions"
- [Source: `docs/architecture.md#3-source-tree`] — confirms no `supabase/` folder exists in the intended structure (tooling-convention variance, not a gap)
- [Source: `_bmad-output/implementation-artifacts/1-1-user-registration.md`] — confirms this story, not 1.1, owns the `interviews`/`questions`/`answers` tables ("No database migration is needed for this story... Story 1.3's responsibility")
- [Source: `_bmad-output/implementation-artifacts/1-2-user-login.md`] — precedent for flagging dashboard-only manual steps as `[Manual step (user, not agent)]`, and for the "prove it with two users, not one" testing discipline

## Dev Agent Record

### Agent Model Used

claude-opus-5

### Debug Log References

**2026-08-01 — DDL verbatim check (AC1).** ~~Diffed the migration's table block against `docs/architecture.md` lines 60–99 (`sed -n '60,99p'` vs `sed -n '16,55p'`).~~ **Corrected (review round 2):** those hardcoded line ranges described the pre-v0.2 files and stopped reproducing the moment §4 changed — re-running the recorded command exits 1. The property held, but the cited evidence did not support it. The check now computes both ranges from the files themselves, so it stays valid across edits:

```sh
A_START=$(grep -n '^create table interviews' docs/architecture.md | cut -d: -f1)
A_END=$(awk -v s="$A_START" 'NR>=s && /^\);$/ {c++; if(c==3){print NR; exit}}' docs/architecture.md)
M_START=$(grep -n '^create table interviews' supabase/migrations/20260801000000_initial_schema.sql | cut -d: -f1)
M_END=$(awk -v s="$M_START" 'NR>=s && /^\);$/ {c++; if(c==3){print NR; exit}}' supabase/migrations/20260801000000_initial_schema.sql)
diff <(sed -n "${A_START},${A_END}p" docs/architecture.md) \
     <(sed -n "${M_START},${M_END}p" supabase/migrations/20260801000000_initial_schema.sql)
```

Result against §4 v0.3: byte-identical, exit 0 (doc lines 67–108, migration lines 24–65).

**2026-08-01 — Pre-apply table probe.** `GET /rest/v1/{interviews,questions,answers}` with the anon key as both `apikey` and bearer token → all three returned `HTTP 404` / `PGRST205 "Could not find the table 'public.<t>' in the schema cache"`. Confirms the migration has not been applied yet, so Task 4's verification cannot run until Task 3 is done. Note for Task 4: a `404 PGRST205` means *table missing*, whereas RLS-blocked anon access returns `HTTP 200` with `[]` — do not confuse the two when checking AC4.

**2026-08-01 — Post-apply probe (Task 3 verified).** User applied the migration via the SQL Editor. Same three `GET`s now return `HTTP 200 []`. Note this result alone proves nothing about RLS — an empty table returns `[]` regardless — which is why the AC4 anon check was deliberately re-run *after* seeding rows (see below), not at this point.

**2026-08-01 — AC1 live schema verification** (`schema-check.mjs`, throwaway script). The anon key cannot read PostgREST's OpenAPI spec (`GET /rest/v1/` → `"Only the service_role API key can be used for this endpoint"`), so the live schema was introspected by inserting one row per table with `Prefer: return=representation` and comparing the returned column set. Results — all PASS:
- Column names **and order** match Architecture §4 exactly for all three tables; no missing and no unexpected columns.
- Defaults behave as specified: `interviews.id` generated as a uuid (so `gen_random_uuid()` resolved — `pgcrypto` was already enabled, the Dev Notes fallback was not needed), `status` defaults to `'in_progress'`, `created_at` defaults to `now()` on all three tables.
- Nullable columns are genuinely nullable and unset when omitted: `resume_text`, `completed_at`, and all four `answers` score columns.
- `not null` is enforced: insert without `role` → `HTTP 400 code 23502` (not-null violation). Insert without `user_id` → `HTTP 403 code 42501`, i.e. rejected by the RLS `with check` clause *before* the not-null constraint is reached — this is the concrete proof of the Dev Notes claim that `user_id` has no default and every insert must state it.
- `on delete cascade` works one level: deleting a `questions` row removed its dependent `answers` row (`DELETE` → 204, follow-up `GET` → `[]`). **Correction (review, 2026-08-01):** this entry originally generalised to "cascade works" from that single level, and the two-level `interviews → questions → answers` path was separately claimed in the cleanup entry on anon-`GET []` evidence, which proves nothing. Both are now properly verified — see the review verification entry below.

**2026-08-01 — Review verification round** (`triage-verify.mjs`, throwaway script; reused accounts A and B so no new accounts were created). A code review found that several claims above were asserted rather than tested. Each was re-run against the live project. **13 claims verified, 6 real issues confirmed, 0 refuted.**

Claims that were untested and now hold:
- **`with check` blocks ownership reassignment** — the headline justification for `for all` policies, previously never exercised. `PATCH /rest/v1/interviews?id=eq.<A's own row>` with `{"user_id": B}` → `403 / 42501`, owner unchanged.
- **Cross-user UPDATE and DELETE are blocked** — A's `PATCH` of B's interview returned `200` with **0 rows affected**, B's `role` unchanged; A's `DELETE` of B's interview and of B's question returned `204` with the rows still present. Note the shape of this result: RLS filters the row out via `using`, so a denied UPDATE/DELETE looks like a *successful no-op*, not a `403`. Only INSERT (which trips `with check`) returns `42501`.
- **Anon writes are blocked** — anon `POST` → `401 / 42501`; anon `PATCH` and `DELETE` → no rows changed. AC4 only tested reads; the anon key ships to the browser, so writes were the more important half.
- **Two-level cascade** — deleting A's `interviews` row removed the dependent question *and* answer, confirmed by re-reading **with A's own token** rather than the anon key.
- **Column types (AC1's "types" clause, previously unverifiable by the stated method)** — a returned JSON row cannot reveal a column's type, so types were probed behaviourally instead: `duration_minutes` rejected `1.5` (`22P02`, so `int` not `numeric`); `overall_score` stored `7.25` (so `numeric` not `int`); `interview_id` rejected `"not-a-uuid"` (`22P02`); `strengths` normalised `{"b":1,"a":2,"a":3}` to `{"a":3,"b":1}` (so `jsonb` not `json`); `created_at` returned with a `+00:00` offset (so `timestamptz` not `timestamp`).

Issues confirmed by the same round (all now fixed in Architecture §4 v0.2 and the migration):
- `technical_score` accepted both `"NaN"` and `-999` — no range constraint existed.
- An explicit `"created_at": null` was stored as NULL, because a `default` only applies when the column is omitted.
- A second `answers` row for the same `question_id` inserted successfully.
- Two `questions` rows accepted `order_index = 1` within one interview.
- A user overwrote their own `overall_score` to `10` and `feedback` to arbitrary text (`200 OK`) — deferred to Epic 3, see Completion Notes.
- A null-FK insert was blocked by RLS (`403 / 42501`), not by a not-null constraint — so the reviewers' "orphan rows" scenario needed SQL-Editor or `service_role` access, and was rated lower than they proposed.

**2026-08-01 — AC2/AC3/AC4 RLS verification** (`rls-verify.mjs`, throwaway script). Accounts were created with `POST /auth/v1/signup` rather than by driving the `/register` page in a browser — that Server Action calls the same endpoint, and doing it over HTTP makes the check scriptable and repeatable. Email confirmation is OFF (Story 1.1 Decision 1), so `signup` returns a live `access_token` directly. Both users seeded one `interviews` → `questions` → `answers` chain. Results — all PASS:
- **AC2:** User A's token on `GET /rest/v1/interviews` returned exactly one row, A's own; B's interview id absent. Symmetric check with B's token returned only B's row.
- **AC3:** User A's token on `GET /rest/v1/questions` and `GET /rest/v1/answers` each returned exactly one row, the one under A's interview; B's question and answer ids absent. This confirms the two-level `exists` join (`answers` → `questions` → `interviews`) resolves ownership correctly.
- **AC4:** with `Authorization: Bearer <anon key>`, all three endpoints returned `HTTP 200 []` **while both users' rows existed** — the ordering that makes this check meaningful.
- **Extra (`with check` clause):** User A attempting `POST /rest/v1/questions` with `interview_id` set to *B's* interview was rejected with `HTTP 403 code 42501`. Not required by any AC, but it is the only check that exercises `with check` on a joined table, which the Dev Notes call out as the clause preventing ownership smuggling.

**2026-08-01 — Test data cleanup.** Users A and B were re-authenticated via `grant_type=password` and their `interviews` rows deleted (cascade removed the dependent questions and answers). ~~Anon `GET /rest/v1/interviews` → `[]`.~~ **Correction (review, 2026-08-01):** that anon read was invalid evidence for a deletion — anon returns `[]` whether or not the rows exist. Re-confirmed properly in the review verification round by re-reading with A's and B's own tokens: both own zero interviews. **Left behind:** one `interviews` row belonging to the `schema-check` throwaway account (its generated email was not logged, so it cannot be re-authenticated), plus three throwaway `auth.users` accounts — deleting auth users requires the dashboard or a `service_role` key, neither available to the agent.

**2026-08-01 — Leftover test data blocks the hardened schema.** The `schema-check` orphan row was inserted with `level = 'Mid'`, which is not one of the values FR2 fixes (`Intern`/`Fresher`/`Junior`/`Middle`). Once §4 v0.2 adds `check (level in (...))`, that row violates the constraint, so an `alter table`-based upgrade path would fail on it. This is why the re-apply is a drop-and-recreate: the project holds no real data (Stories 1.1/1.2 only ever wrote to `auth.users`), so recreating is both safe and the only path that guarantees the live database matches the migration file exactly.

**2026-08-01 — Post-review re-apply and verification (round 1).** User dropped the three tables and re-applied the hardened migration via the SQL Editor. `npm run verify:rls` → all checks passed, exit 0.

**Corrections to this entry (review round 2), all three of them overclaims:**
1. It recorded **"27/27 PASS"**. The committed script emitted **28** check lines — two of its 24 call sites sit inside loops of three. Recounted against the captured output: 28. The figure was wrong in the Change Log too.
2. It claimed **"each constraint added in §4 v0.2"** was re-confirmed. Roughly half were never exercised: the `role`, `interview_type`, and `status` enums, `max_questions > 0`, `order_index >= 0`, `not null` on both foreign keys and on two of the three `created_at` columns, and three of the four score columns. `on delete cascade` on `user_id` — the highest-severity finding of round 1 — is not testable with an anon key at all and had no check.
3. It claimed the error code proved **"which mechanism did the rejecting"**. The script captured the SQLSTATE into a display string and never asserted it; every constraint check was a bare `status >= 400`, which a missing column or a malformed body satisfies just as well.

The individual results below were accurate as far as they went; the summary framing around them was not. Round 2 rewrote the script to assert SQLSTATEs, cover the remaining constraints, and mark the two genuinely untestable properties as SKIP rather than implying coverage.
- Isolation (AC2/AC3): A and B each see exactly their own row in all three tables; neither sees the other's.
- Cross-user writes: insert under another user's interview and ownership reassignment both `403 / 42501` (RLS `with check`); cross-user `UPDATE`/`DELETE` are silent no-ops, since `using` filters the row out before the statement reaches it.
- Anonymous (AC4): all three reads `[]` while both users held rows; anon insert `401 / 42501`; anon update and delete changed nothing.
- New constraints: `level` and `duration_minutes` outside the allowed sets → `23514` (check violation). Scores `-1`, `99`, **and `"NaN"`** → `23514` — worth noting that `between 0 and 10` rejects `NaN` for free, because Postgres orders `NaN` above every other numeric value, so the upper bound catches it. A second answer for one question and a duplicate `order_index` → `409 / 23505` (unique violation). Explicit `"created_at": null` → `23502` (not-null violation), the exact write that silently succeeded before.
- Cascade: deleting an `interviews` row removed the dependent question and answer, re-read with the owner's own token.
- Cleanup: both accounts own zero rows afterwards, confirmed per-owner rather than with the anon key.

**2026-08-01 — Round-2 re-apply and verification.** User dropped the three tables and applied §4 v0.3. `npm run verify:rls` → **49/49 checks passed, 2 SKIP**, exit 0. The count is now emitted by the script itself rather than counted by hand, which is what produced the wrong "27/27" figure last time.

What the rewritten script now proves that the round-1 version did not:
- **Every rejection asserts its SQLSTATE.** `23514` for each check constraint, `23505` for each unique violation, `23502` for not-null, `22P02` for a type error, `42501` for RLS. A missing column or malformed body can no longer masquerade as a passing constraint check.
- **The three new §4 v0.3 constraints hold.** FR10 pairing rejects both `15 + 9999` and `30 + 3` while accepting the documented `60 + 9`; `order_index = 0` is rejected as 1-based; the score range accepts both inclusive boundaries `0` and `10` — a case round 1 never tested, and one that would have caught a constraint mistakenly written `> 0 and < 10`.
- **The two deliberate non-constraints are asserted as decisions.** `status = 'awaiting_report'` and `interviews.overall_score = 87` both succeed. If someone re-adds either constraint without reading §4's rationale, these checks fail and point at the reason.
- **`with check` is now exercised on all three tables.** Round 1 tested ownership reassignment on `interviews` only; moving a question under another user's interview, and an answer under another user's question, are both rejected `42501`.
- **Anonymous writes are tested against all three tables**, not just `interviews` — the child policies are structurally different (join subqueries rather than a column compare), so they needed their own checks.
- **The cascade check proves deletion rather than invisibility** via `Prefer: return=representation` (`deleted=1`), closing the hole where an orphaned-but-invisible row read as a successful cascade.
- **Two properties are marked SKIP with the reason stated.** `not null` on the three foreign keys is unreachable through this API surface (RLS returns `42501` before the constraint is evaluated — measured, not assumed), and `on delete cascade` on `user_id` needs dashboard or `service_role` access. Round 1 silently omitted both while claiming full coverage.

Behavioural note worth keeping: a denied cross-user `UPDATE`/`DELETE` returns **HTTP 200/204 affecting zero rows**, not `403`. `using` filters the row out before the statement reaches it; only `INSERT` (which trips `with check`) returns `42501`. Epic 3 route code that treats "not 403" as success would report a phantom deletion to the user.

**2026-08-01 — Final regression check.** `npm run lint` → clean, no warnings or errors. No files under `app/`, `lib/`, or `components/` were touched by this story, so no further application-level regression surface exists.

### Completion Notes List

- **Tasks 1–2 complete.** Single migration file `supabase/migrations/20260801000000_initial_schema.sql` holds both the schema and the RLS setup. Tables are ordered `interviews` → `questions` → `answers` to satisfy foreign-key dependencies. No Storage bucket created (NFR3).
- Policies are `for all` with matching `using` / `with check` clauses, exactly as specified in Dev Notes — `select`-only policies would satisfy AC2–AC4 today but block every insert Epic 2/3 needs.
- `create extension pgcrypto` was deliberately **not** added pre-emptively, per the Dev Notes gotcha — only add it if the SQL Editor actually errors on `gen_random_uuid()`.
- **Task 3 complete.** The user applied the migration through the Supabase SQL Editor on 2026-08-01. The agent could not do this itself: `.env.local` holds only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and the anon key has no DDL rights by design.
- **Task 4 complete — all four ACs verified against the live project.** AC1 by live column/default/constraint introspection, AC2/AC3 by two-user cross-checks, AC4 by an anon read taken *after* both users had rows. Full evidence in Debug Log References.
- `pgcrypto` was already enabled — `gen_random_uuid()` resolved with no error, so the Dev Notes fallback (`create extension if not exists pgcrypto;`) was correctly never added to the migration file, keeping it a verbatim match to Architecture §4.
- **Verification method deviated from the task text in one place:** throwaway accounts were created via `POST /auth/v1/signup` instead of by hand through the `/register` page. Same endpoint the register Server Action calls, but scriptable and repeatable. Flagged here rather than silently substituted.
- ~~**Optional dashboard cleanup:** ... Deleting the auth users from the dashboard removes them ...~~ **Corrected (review, 2026-08-01) — the original instruction was wrong and would have failed.** With no `on delete` rule the foreign key defaulted to `NO ACTION`, which does not orphan the child row: it **blocks** the parent delete with `23503`. Deleting the `schema-check` auth user while its `interviews` row existed was therefore impossible, and that row was unreachable by any API token (its account's generated email was never logged, and RLS hides it from every other user), so only the SQL Editor could remove it. The drop-and-recreate re-apply removes the row as a side effect, and §4 v0.2's `on delete cascade` means the ordering problem cannot recur.
- **Code review outcome (2026-08-01).** Three review layers ran in parallel; 24 findings survived triage. Six documentation errors in this record were patched, six schema defects were fixed in Architecture §4 v0.2, ten items were deferred, three were dismissed. The RLS policies themselves needed no change — every isolation property, including the ones never previously tested, verified correctly on re-examination.
- **Deferred to Epic 3 — users can rewrite their own AI scores.** Confirmed live: a signed-in user can `PATCH` their own `answers` row and set any `technical_score` / `overall_score` / `feedback`. The policies check ownership only. This cannot be closed here: the fix is to revoke write access to those columns from `authenticated`, but the AI evaluation writes through that same user session, so revoking now would block the feature before it is built. The story that implements evaluation must introduce a privileged writer first — a server-only `SUPABASE_SERVICE_ROLE_KEY` (never `NEXT_PUBLIC_`) or a `security definer` function — and revoke the columns in the same change.
- No automated test suite exists for this MVP (Architecture §8), but RLS is the application's only security control, so a **manual** verification script is kept in the repo: `scripts/verify-rls.mjs`, run with `npm run verify:rls`. Run it after any policy or schema change and after a Supabase upgrade.
- **The round-1 version of that script was the most dangerous thing in the change, and was rewritten.** Its reset step issued `DELETE /rest/v1/interviews?id=not.is.null` with no `user_id` filter, twice, before any assertion ran. The only thing bounding that delete was the RLS policy the script exists to test — so a migration that weakened the policy would have caused `npm run verify:rls` to delete every interview in the project, cascading to all questions and answers, and only then report the failure. The rewrite filters every delete client-side by `user_id`, so the blast radius never depends on the property under test. Other defects fixed in the same pass: bare `status >= 400` assertions replaced with SQLSTATE comparisons; absence assertions now require HTTP 200 first (previously `[]` from an error body made them pass against a dead API); the cascade check now uses `Prefer: return=representation` to prove a row was actually deleted rather than merely invisible; per-run row tagging so overlapping runs cannot corrupt each other's counts; a 15s request timeout (a paused free-tier project otherwise hangs the script forever); cleanup in a `finally` block; credentials read from the environment per the project's no-hardcoded-secrets rule; and honest `SKIP` lines for the two properties an anon key genuinely cannot verify.

### File List

- `supabase/migrations/20260801000000_initial_schema.sql` (new)
- `scripts/verify-rls.mjs` (new — added by code review)
- `package.json` (modified — added the `verify:rls` script)
- `.env.example` (modified — documents `RLS_VERIFY_PASSWORD`; the script has no committed default, so no working credential lives in the repo)
- `docs/architecture.md` (modified — §4 hardened to v0.2 by code review; Change Log entry added)
- `_bmad-output/implementation-artifacts/1-3-database-schema-rls-setup.md` (new — this file was untracked at review time; the earlier "(modified)" label was wrong)
- `_bmad-output/implementation-artifacts/deferred-work.md` (modified — ten deferred review findings appended)

## Change Log

| Date | Change |
| --- | --- |
| 2026-08-01 | Tasks 1–2: added `supabase/migrations/20260801000000_initial_schema.sql` with the three-table schema (verbatim from Architecture §4) plus `for all` RLS ownership policies on all three tables. Status → in-progress. Tasks 3–4 await the manual dashboard apply step. |
| 2026-08-01 | Task 3: user applied the migration via the Supabase SQL Editor; tables confirmed live. |
| 2026-08-01 | Task 4: verified all four ACs against the live project — schema/defaults/constraints match Architecture §4, per-user isolation holds on all three tables across two users, anon reads return empty with rows present. Test rows cleaned up. `npm run lint` clean. Status → review. |
| 2026-08-01 | Code review (3 parallel layers): 8 decision-needed, 6 patch, 10 deferred, 3 dismissed. Re-verified the untested claims live — cross-user UPDATE/DELETE, `with check` ownership reassignment, anon writes, two-level cascade, and column types all confirmed correct. Patched six documentation errors in the Dev Agent Record, including a cascade claim and a cleanup instruction that were both wrong. |
| 2026-08-01 | Architecture §4 → v0.2 (user-approved): `on delete cascade` on `interviews.user_id`, `not null` on both FKs and all `created_at`, one-answer-per-question, unique `(interview_id, order_index)`, 0–10 score ranges, and enum checks for `role`/`level`/`interview_type`/`status`/`duration_minutes`. `difficulty` left unconstrained (no doc defines its values). Migration updated to match verbatim and wrapped in a single transaction. |
| 2026-08-01 | Added `scripts/verify-rls.mjs` + `npm run verify:rls` — repeatable manual verification for RLS and the new constraints. Status → in-progress pending the schema re-apply. |
| 2026-08-01 | Schema re-applied by user (drop + recreate, no real data existed). `npm run verify:rls` passed. `npm run lint` clean. Status → done. *(The "27/27" recorded here was wrong — the script emitted 28 checks; corrected in round 2.)* |
| 2026-08-01 | Code review round 2, over the round-1 hardening itself: 6 decision-needed, 21 patch, 5 deferred, 8 dismissed. The verification script added in round 1 carried a data-loss defect and could pass while the system was broken; rewritten. |
| 2026-08-01 | Architecture §4 → v0.3 (user-approved): **removed** three constraints that encoded guesses — the `status` enum (blocked Story 4.1 AC2's retry state), the 0–10 range on `interviews.overall_score` (FR8 fixes that scale for per-answer criteria only), and `order_index >= 0` (tightened to `>= 1` per Story 3.1 AC3). **Added** the FR10 `(duration_minutes, max_questions)` pairing and an explicit index on `interviews.user_id`. **Corrected** the `answers.question_id unique` rationale — verified against the current Anthropic API reference, which combines consecutive same-role messages rather than rejecting them. Removed `begin;`/`commit;` for `supabase db push` compatibility. |
| 2026-08-01 | Schema v0.3 re-applied by user; `scripts/verify-rls.mjs` rewritten. `npm run verify:rls` → 49/49 passed, 2 SKIP (count emitted by the script, not hand-counted). `npm run lint` clean. All 28 round-2 findings resolved. Status → done. |
