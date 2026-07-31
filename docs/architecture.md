# InterviewHub AI — Architecture Document

## 1. Introduction

This document describes the technical architecture that implements the requirements defined in the PRD. Scope: solo developer, 1-month build, free-tier deployment, vibe-coded with an AI coding agent under human review at each step.

### Change Log
| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-20 | 0.1 | Initial architecture drafted from project overview doc | — |

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
└── .env.local                 # environment variables (never committed)
```

---

## 4. Data Models

```sql
create table interviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  role text not null,
  level text not null,
  interview_type text not null,
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
  created_at timestamptz default now(),
  completed_at timestamptz
);

create table questions (
  id uuid primary key default gen_random_uuid(),
  interview_id uuid references interviews(id) on delete cascade,
  content text not null,
  topic text,
  order_index int not null,
  created_at timestamptz default now()
);

create table answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid references questions(id) on delete cascade,
  answer_text text not null,
  technical_score numeric,
  problem_solving_score numeric,
  communication_score numeric,
  overall_score numeric,
  feedback text,
  created_at timestamptz default now()
);
```

RLS must be enabled on all three tables (`auth.uid() = user_id`, directly or via join through `interview_id`). No Supabase Storage bucket is needed — the resume file only exists transiently during parsing.

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