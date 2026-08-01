# InterviewHub AI — Architecture Document

## 1. Introduction

This document describes the technical architecture that implements the requirements defined in the PRD. Scope: solo developer, 1-month build, free-tier deployment, vibe-coded with an AI coding agent under human review at each step.

### Change Log
| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-20 | 0.1 | Initial architecture drafted from project overview doc | — |
| 2026-08-01 | 0.2 | §4 hardened after the Story 1.3 code review: `on delete cascade` on `interviews.user_id`, `not null` on both foreign keys and all `created_at` columns, one-answer-per-question and unique `(interview_id, order_index)` constraints, and `check` constraints for the 0–10 score scale and the enumerations already fixed in FR2/FR8. `difficulty` left unconstrained — its allowed values are undefined in every planning doc. | Code review |
| 2026-08-01 | 0.3 | Round-2 review corrections to 0.2. **Removed three constraints that encoded guesses rather than documented facts:** the two-value `status` enum (made Story 4.1 AC2's retry state unrepresentable), the 0–10 range on `interviews.overall_score` (FR8 fixes that scale for per-answer criteria only), and `order_index >= 0` (Story 3.1 AC3 is 1-based — tightened to `>= 1`). **Added** the FR10 `(duration_minutes, max_questions)` pairing, which the independent per-column checks had left open. **Corrected** the `answers.question_id unique` rationale — the claim that the Anthropic Messages API rejects consecutive same-role turns is false; it combines them. Also corrected the not-null-FK note, which described a failure mode this project's own live testing refuted, and documented the score-forgery limitation here rather than only in a SQL comment. Enum values re-attributed: `status` originates in Epic 4 / Epic 5, not FR8. | Code review round 2 |

---

## 2. Tech Stack

| Category | Technology | Notes |
|---|---|---|
| Framework | Next.js 15 (App Router) | Single app serves both frontend and backend |
| Language | TypeScript | Required across the codebase, no plain `.js` |
| Styling | Tailwind CSS | Utility-first |
| Database | Supabase Postgres | Free tier |
| Auth | Supabase Auth | Email/password for MVP; Google OAuth is optional/post-MVP |
| AI provider | Anthropic API | Structured output via tool use — never free-text JSON parsing |
| Resume parsing | `pdf-parse`, `mammoth` | PDF and DOCX only, by design (see PRD NFR5) |
| Charts | Recharts | Used on the dashboard |
| Deployment | Vercel | Hobby (free) tier |
| Schema validation | `zod` | Validates every AI JSON response before it's trusted |

---

## 3. Source Tree

```
interviewhub-ai/
├── app/
│   ├── (auth)/login/page.tsx
│   ├── (auth)/register/page.tsx
│   ├── dashboard/page.tsx
│   ├── interviews/
│   │   ├── page.tsx                        # history list
│   │   ├── new/page.tsx                    # create form + resume upload
│   │   └── [id]/page.tsx, [id]/report/page.tsx
│   └── api/
│       ├── resume/parse/route.ts           # POST — extract text, discard file
│       ├── interviews/route.ts             # POST — create session + first question
│       └── interviews/[id]/answer/route.ts # POST — evaluate + next question
├── lib/
│   ├── supabase/            # server client + browser client, kept separate
│   ├── ai/                  # prompt templates, zod schemas, the single AI-call wrapper
│   └── types/                # shared TypeScript types
├── components/               # reusable UI components
├── supabase/migrations/      # version-controlled schema SQL, applied by hand (no CLI yet)
├── scripts/                  # throwaway operational scripts, not part of the build
│   └── verify-rls.mjs        # npm run verify:rls — manual RLS regression check
└── .env.local                 # environment variables (never committed)
```

`supabase/` and `scripts/` are tooling-convention folders rather than design choices; neither is imported by the application. `supabase/migrations/` uses the Supabase CLI's `YYYYMMDDHHMMSS_` filename convention even though the CLI is not installed and the SQL is applied through the dashboard — revisit that inconsistency when a second migration lands.

---

## 4. Data Models

```sql
create table interviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  role text not null check (role in ('Frontend','Backend','Fullstack','Mobile','DevOps')),
  level text not null check (level in ('Intern','Fresher','Junior','Middle')),
  interview_type text not null check (interview_type in ('Technical','Behavioral','Mixed')),
  difficulty text not null,
  duration_minutes int not null,
  max_questions int not null,
  resume_text text,               -- extracted text only; original file is never persisted
  job_description text,
  status text not null default 'in_progress',
  overall_score numeric,
  strengths jsonb,
  weaknesses jsonb,
  roadmap jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  check ((duration_minutes, max_questions) in ((15,3),(30,5),(45,7),(60,9)))
);

create table questions (
  id uuid primary key default gen_random_uuid(),
  interview_id uuid not null references interviews(id) on delete cascade,
  content text not null,
  topic text,
  order_index int not null check (order_index >= 1),
  created_at timestamptz not null default now(),
  unique (interview_id, order_index)
);

create table answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null unique references questions(id) on delete cascade,
  answer_text text not null,
  technical_score numeric check (technical_score between 0 and 10),
  problem_solving_score numeric check (problem_solving_score between 0 and 10),
  communication_score numeric check (communication_score between 0 and 10),
  overall_score numeric check (overall_score between 0 and 10),
  feedback text,
  created_at timestamptz not null default now()
);
```

RLS must be enabled on all three tables (`auth.uid() = user_id`, directly or via join through `interview_id`). No Supabase Storage bucket is needed — the resume file only exists transiently during parsing.

**Constraint notes** (0.2, revised in 0.3). The governing rule: **constrain only what a planning document actually fixes.** A `check` that encodes a guess is worse than no `check` — it converts an undocumented assumption into a runtime `23514` at the worst possible moment, and 0.2 shipped three of those.

- `user_id ... on delete cascade` — without an explicit rule the foreign key defaults to `NO ACTION`, which *blocks* deleting an `auth.users` row rather than cleaning up after it. Account deletion would fail with `23503`.
- `check ((duration_minutes, max_questions) in ((15,3),(30,5),(45,7),(60,9)))` — FR10 and Story 2.1 AC2 fix this mapping exactly. Constraining the two columns *independently* (as 0.2 did) left the pair free, so `duration_minutes = 15, max_questions = 9999` was storable — a combination FR10 forbids, and one that would drive an unbounded number of billed AI calls, since every write goes through the user's own session with no privileged writer in between.
- `question_id ... unique` on `answers` — one answer per question. **Corrected in 0.3:** 0.2 justified this by claiming the Anthropic Messages API rejects two consecutive `user` turns. That is false — the API combines consecutive same-role messages into a single turn. The real justification is narrower but still sound: a duplicate answer double-counts that question in the final score aggregation, and any "the answer for this question" lookup returns a nondeterministic row (`created_at` is not unique). **Consequence for Epic 3:** the answer route must treat a resubmission as an UPDATE, not an INSERT. NFR1 allows evaluation to fail after its retries, and if the answer row was written first, a naive retry now hits `23505`.
- `unique (interview_id, order_index)` — `order by order_index` has no tiebreaker, so duplicate indexes make question order vary between requests and silently reorder the replayed conversation. Two concurrent submissions computing the same next index now collide with `23505`; the answer route must map that to a retry rather than a 500.
- `check (order_index >= 1)` — Story 3.1 AC3 persists the first question with `order_index = 1`, and Story 3.3 AC1 ends the session when `order_index` reaches `max_questions`; both only terminate correctly on a 1-based sequence. 0.2's `>= 0` admitted a 0-based writer under which the auto-end condition never fires.
- `not null` on both foreign keys — defence in depth. Note this is *not* the failure mode 0.2 claimed: live testing showed a null-FK insert is rejected `403 / 42501` by RLS, not silently orphaned. Orphans are only reachable through the SQL Editor or a future `service_role` path.
- Score ranges `between 0 and 10` on the **`answers`** columns — FR8 fixes 0–10 for the three per-answer criteria, and `answers.overall_score` aggregates those three values on the same row, so its scale is derivable. The range also rejects `NaN`, which `numeric` otherwise accepts and which poisons every `AVG()`/`SUM()` it reaches (Postgres orders `NaN` above all other numerics, so the upper bound catches it).
- **`interviews.overall_score` is deliberately unconstrained.** FR11 and Story 4.1 AC1 say "overall score" with no range; nothing fixes the whole-interview scale. 0.2 assumed 0–10 and applied a `check`. If Epic 4 emits any other scale, that write fails `23514` *after* a completed AI call — producing exactly the "permanently stuck with no report" outcome Story 4.1 AC2 rules out. The asymmetry decides it: guessing wrong here breaks a documented AC, while leaving it open breaks nothing today.
- **`status` is deliberately unconstrained.** Epics fix only `'in_progress'` (Story 2.2) and `'completed'` (Story 4.1 AC2), but Story 4.1 AC2 also requires an interview whose questions are answered and whose report generation failed to remain retryable rather than "permanently stuck". That is a third state no document names. 0.2's two-value `check` made it unrepresentable, forcing such rows back to `'in_progress'` — where Story 5.2 AC3 hides them from every screen and the retry path becomes unreachable. Epic 4 owns defining the full state set and adding the constraint then.
- `difficulty` remains unconstrained — no document defines its allowed values.
- `not null` on `created_at` — a `default` only applies when the column is *omitted*; an explicit `"created_at": null` in a PostgREST body is otherwise stored, and NULLs sort first in a newest-first list.

**Known limitation — users can write their own scores.** The RLS policies check ownership only. A signed-in user can `PATCH` their own `answers` row and set any `technical_score` / `overall_score` / `feedback`; this is confirmed live, not theoretical. It cannot be closed at the schema level while the AI evaluation writes through the same user session: revoking those columns from `authenticated` would block the feature before it is built. The story that implements evaluation must first introduce a privileged writer — a server-only `SUPABASE_SERVICE_ROLE_KEY` (never `NEXT_PUBLIC_`) or a `security definer` function — and revoke the columns in the same change.

---

## 5. API Design

| Route | Method | Purpose |
|---|---|---|
| `/api/resume/parse` | POST | Accepts a PDF/DOCX file, extracts text via `pdf-parse`/`mammoth`, discards the file, returns the extracted text |
| `/api/interviews` | POST | Creates an `interviews` row and generates question #1 via AI |
| `/api/interviews/[id]/answer` | POST | Persists the answer, calls AI once to both evaluate it and generate the next question (or close the session if `max_questions` is reached) |

Every route validates its input with `zod` before processing, and every AI response is validated against a defined schema before being trusted (see Section 7).

---

## 6. AI Conversation & Evaluation Design

### 6.1 Context management
Each API route is stateless between calls. Every request rebuilds full context from the database:
- **System prompt** (constant for the whole session): resume text + job description + role/level/difficulty
- **Messages array**: all prior `questions`/`answers` for the interview, replayed as alternating `assistant` (question) / `user` (answer) turns, with the newest answer as the final `user` message

### 6.2 Evaluation criteria (intentionally limited to 3)
Only **technical knowledge**, **problem-solving**, and **communication** (meaning clarity/structure of the written answer) are scored. This is a deliberate constraint: since the interview is text-only, criteria that require audio/video signal (confidence, tone) are out of scope and would not be a trustworthy AI judgment from text alone.

### 6.3 Structured output & retry
AI responses that the app parses as data (question generation, evaluation, final report) go through Anthropic's tool-use / JSON schema feature rather than a "please reply in JSON" instruction. Output is validated with `zod`. On validation failure, retry the AI call up to 2 times with the specific error appended to the prompt; if it still fails, return a clear error to the client instead of crashing.

---

## 7. Coding Standards

- File/folder names: kebab-case. Components: PascalCase.
- Every AI call goes through a single shared function in `lib/ai/` — never called ad hoc from inside a route handler.
- Every API route wraps its logic in try/catch and returns errors as `{ error: string }` with an appropriate status code.
- No hardcoded secrets — always read from `process.env`.

---

## 8. Testing Strategy

No automated test suite is required for this MVP. Manual/exploratory testing against the core flow (register → create interview → answer → view report) before each weekly deploy is sufficient at this scope.

---

## 9. Security

- RLS enabled on every table, no exceptions.
- The resume file is never stored — deleted immediately after text extraction.
- The AI API key is used server-side only (inside route handlers) and never exposed to the client.

---

## 10. Deployment

Deploy via Vercel, connected to the GitHub repository for auto-deploy on push. Environment variables (Supabase keys, AI API key) are set in the Vercel dashboard — never committed to the repository.