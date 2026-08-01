-- InterviewHub AI — initial schema
-- Story 1.3: Database Schema & RLS Setup
--
-- Tables are created in dependency order: interviews -> questions -> answers.
-- Each later table's foreign key references the one before it, so any other
-- order fails at creation time.
--
-- No Supabase Storage bucket is created here: the uploaded resume file is
-- transient and never persisted (only its extracted text is stored, in
-- interviews.resume_text).
--
-- APPLY THIS FILE AS A SINGLE SCRIPT, not statement by statement. A partial
-- apply can leave a table created and already visible to PostgREST while its
-- RLS is not yet enabled, or enabled with zero policies -- both are worse than
-- no table at all, and neither announces itself. There is deliberately no
-- explicit `begin;`/`commit;` here: `supabase db push` wraps each migration in
-- its own transaction, and a nested begin/commit would end that outer
-- transaction early, defeating the atomicity it provides.

-- ---------------------------------------------------------------------------
-- Tables (verbatim from docs/architecture.md §4)
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
--
-- Policies are `for all`, not just `for select`. The app never uses a
-- service_role key: every read AND write goes through the signed-in user's own
-- session against the anon key, so inserts/updates are RLS-checked too. RLS
-- default-denies any operation with no matching policy, so a select-only
-- policy would silently block every insert later features need.
--
-- `using` gates which existing rows a statement may read/update/delete.
-- `with check` gates the row a write is allowed to leave behind. Both are
-- needed and must match: a using-only policy would let an update reassign a
-- row's ownership away from its real owner, because nothing validates the
-- resulting row.
--
-- Anonymous requests need no separate deny policy: under the anon role
-- auth.uid() is null, and `null = user_id` is never true, so every policy
-- below denies access on its own.
--
-- Known limitation (deferred to Epic 3): these policies check ownership only.
-- They do not stop a user from PATCHing their own score/feedback columns,
-- because the AI evaluation writes through that same user session. Closing it
-- needs a privileged writer (server-only service_role key or a security-definer
-- function), which is a decision for the story that builds evaluation.

alter table interviews enable row level security;

create policy "owner_full_access" on interviews
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table questions enable row level security;

-- questions has no user_id column; ownership is derived by joining up to the
-- parent interview via interview_id.
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

-- answers is two levels down: answers -> questions -> interviews.
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

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
--
-- The unique constraints above already created indexes covering
-- questions(interview_id, order_index) and answers(question_id), which is what
-- the child-table RLS subqueries and the cascade deletes scan. interviews has
-- no such constraint, so its filter column needs an explicit index: every
-- interviews RLS evaluation, the history list, and every auth.users cascade
-- delete filters on user_id. Postgres does not index foreign-key columns
-- automatically.

create index interviews_user_id_idx on interviews (user_id);
