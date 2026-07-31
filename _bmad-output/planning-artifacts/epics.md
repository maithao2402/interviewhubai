---
stepsCompleted: [1, 2, 3, 4]
inputDocuments: ['docs/prd.md', 'docs/architecture.md']
---

# InterviewHub AI - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for InterviewHub AI, decomposing the requirements from the PRD and Architecture requirements into implementable stories. The PRD (`docs/prd.md`) already contains a first-draft Epic List and Epic Details section — this document uses that draft as its starting point and refines it through the standard epic/story design process (splitting, sequencing, and acceptance-criteria detailing) rather than rebuilding from zero.

## Requirements Inventory

### Functional Requirements

**Core (MVP, must build):**

FR1: Users can register and log in with email/password (Supabase Auth).
FR2: Users can create a new interview session by selecting: role (Frontend/Backend/Fullstack/Mobile/DevOps), experience level (Intern/Fresher/Junior/Middle), interview type (Technical/Behavioral/Mixed), difficulty, and duration (15/30/45/60 minutes).
FR3: Users can upload a resume file in PDF or DOCX format; the system extracts its text content automatically.
FR4: Users can review and manually edit the extracted resume text before it is saved, to correct any extraction errors.
FR5: Users can paste a job description as free text.
FR6: The system generates the first interview question via AI, using role, level, interview type, difficulty, resume text, and job description as context.
FR7: Users submit a free-text answer to each question.
FR8: The system evaluates each answer via AI on three criteria — technical knowledge, problem-solving, and communication (clarity/structure of the written answer) — each scored 0–10, with written feedback.
FR9: The system generates the next question via AI, using the full prior conversation (all previous questions and answers in the session) as context, adjusting difficulty based on recent performance.
FR10: The session automatically ends once the number of questions reaches the limit set by the chosen duration (15min→3, 30min→5, 45min→7, 60min→9).
FR11: On session completion, the system generates a final report via AI: overall score, three strengths, three weaknesses, and a 3-week improvement roadmap.
FR12: Users can view a dashboard: total sessions completed, average score, recent sessions, and skill progress over time.
FR13: Users can view a history of all past sessions and reopen any one to review its questions, answers, per-answer scores, and final report.

**Optional / nice-to-have (post-MVP if time allows — not scheduled into epics unless time remains):**

FR14: Users can sign in with Google.
FR15: A live countdown timer is shown during each question.
FR16: Users can compare their scores across different interview types.
FR17: Before the interview starts, the system runs a "Job Gap Analysis" comparing resume skills against job description requirements, and uses the gaps to bias question selection toward weak areas.
FR18: A "Stress Mode" enforces stricter per-answer time limits and auto-submits when time expires.

### NonFunctional Requirements

NFR1: All AI responses that the application parses as data (question generation, evaluation, final report) must be constrained to a defined JSON schema; on a parsing/validation failure, the system retries the AI call up to 2 times before surfacing a clear error to the user.
NFR2: Row Level Security (RLS) must be enabled on every database table so a user can only read or write their own data.
NFR3: The uploaded resume file must never be persisted to storage — it is parsed for text and discarded immediately after extraction.
NFR4: The application must run within the free tiers of its hosting/database providers (no paid infrastructure required for personal/portfolio-scale usage).
NFR5: Resume upload only needs to support PDF and DOCX formats.
NFR6: Evaluation criteria are limited to what is reasonably inferable from text alone (technical knowledge, problem-solving, written communication clarity). Criteria that require audio/video signal (confidence, tone of voice, body language) are explicitly out of scope for this text-based MVP.
NFR7: The interview session must maintain full conversational context across multiple stateless API calls by reconstructing history from the database on every request (no reliance on in-memory server state).

### Additional Requirements

- **Starter template**: No dedicated scaffolding tool specified. The repo already has a base Next.js (App Router) app from `create-next-app` (see initial commit) — Epic 1 Story 1 should build on this existing scaffold rather than reinitializing.
- **Source tree**: Fixed structure per Architecture §3 — `app/(auth)/...`, `app/dashboard/`, `app/interviews/...`, `app/api/...`, `lib/supabase/`, `lib/ai/`, `lib/types/`, `components/`. Stories should place new files according to this layout.
- **Data model / migrations**: Three tables must be created — `interviews`, `questions`, `answers` — with the exact columns in Architecture §4, plus RLS policies scoping every table to `auth.uid() = user_id` (directly, or via join through `interview_id` for `questions`/`answers`).
- **API routes**: Exactly three route handlers are defined — `POST /api/resume/parse`, `POST /api/interviews`, `POST /api/interviews/[id]/answer` — each validating input with `zod` and validating AI output with `zod` before trusting it.
- **AI call architecture**: All AI calls must go through one shared function in `lib/ai/`, using Anthropic tool-use/structured output (never "please reply in JSON" prompting), with up to 2 retries on schema validation failure (ties to NFR1).
- **No storage bucket needed**: Resume files are transient (in-memory during the parse request) — no Supabase Storage bucket should be created for them (ties to NFR3).
- **Deployment**: Vercel, connected to the GitHub repo for auto-deploy on push; env vars (Supabase keys, Anthropic API key) set in the Vercel dashboard only, never committed.
- **No automated test suite required**: Manual/exploratory testing of the core flow (register → create interview → answer → view report) before each deploy is the accepted testing strategy for this MVP — stories should not include automated test-writing tasks.

### UX Design Requirements

*(No dedicated UX design document exists. The following are derived from the PRD §3 "UI/UX Goals" section, which is the only UX input available.)*

UX-DR1: Implement the six key screens: Login/Register, Dashboard, New Interview (role/level/type/difficulty/duration selectors + resume upload + job description textarea), Interview Session, Final Report, Session History (list + detail view of any past session).
UX-DR2: The Interview Session screen must be distraction-free — show one question and one answer input box at a time, no extraneous UI.
UX-DR3: Extracted resume text must be shown in an editable textarea before it is saved, so the user can see and correct what the AI will use as context (ties to FR4).
UX-DR4: The Dashboard must visually communicate score improvement over time (a trend chart via Recharts), not just a static number (ties to FR12).

### FR Coverage Map

FR1: Epic 1 - Register/login with Supabase Auth
FR2: Epic 2 - Session parameter selection (role/level/type/difficulty/duration)
FR3: Epic 2 - Resume upload + text extraction
FR4: Epic 2 - Editable extracted resume text
FR5: Epic 2 - Job description textarea
FR6: Epic 3 - AI generates first question
FR7: Epic 3 - User submits answer
FR8: Epic 3 - AI evaluates answer (3 criteria)
FR9: Epic 3 - AI generates adaptive next question
FR10: Epic 3 - Session auto-ends at question limit
FR11: Epic 4 - AI-generated final report
FR12: Epic 5 - Dashboard stats + skill chart
FR13: Epic 5 - Session history list + detail view
FR14-FR18: Not scheduled (post-MVP optional — Google sign-in, countdown timer, cross-type comparison, Job Gap Analysis, Stress Mode)

## Epic List

### Epic 1: Foundation & Auth
Users can create an account and log in; the database is ready to securely store interview data.
**FRs covered:** FR1
**Also satisfies:** NFR2 (RLS on all tables, set up here since schema is created here)

### Epic 2: Interview Intake
Users can start a new interview session by choosing role/level/type/difficulty/duration, uploading a resume (auto-parsed to text, editable before saving), and pasting a job description.
**FRs covered:** FR2, FR3, FR4, FR5
**Also satisfies:** NFR3 (resume file never persisted), NFR5 (PDF/DOCX only)

### Epic 3: AI Interview Session Engine
The core loop works end-to-end: AI asks a tailored first question, evaluates each answer on 3 criteria, asks an adaptive next question using full conversation history, and the session ends automatically at the right question count.
**FRs covered:** FR6, FR7, FR8, FR9, FR10
**Also satisfies:** NFR1 (JSON schema + retry), NFR6 (text-only criteria), NFR7 (stateless context reconstruction)

### Epic 4: Final Report
On finishing a session, the user gets an AI-generated report: overall score, 3 strengths, 3 weaknesses, 3-week roadmap.
**FRs covered:** FR11
**Also satisfies:** NFR1 (JSON schema + retry, same pattern as Epic 3)

### Epic 5: Dashboard & History
Users can see their progress over time (stats + skill chart) and revisit any past session in full detail.
**FRs covered:** FR12, FR13

### Epic 6: Deployment & Documentation
The project is live on a public URL and documented well enough for a recruiter/interviewer to understand it quickly.
**FRs covered:** *(none directly — delivers NFR4 and the "shippable, demoable MVP" goal from the PRD)*
**Also satisfies:** NFR4 (free-tier hosting)

**Dependency flow:** 1 → 2 → 3 → 4 → 5 → 6, strictly linear — each epic needs the previous one's data to exist.

## Epic 1: Foundation & Auth

Users can create an account and log in; the database is ready to securely store interview data.

### Story 1.1: User Registration with Email/Password

As a new user,
I want to register with email/password,
So that I have an account to save my interview practice.

**Acceptance Criteria:**

**Given** I am on the registration page
**When** I submit a valid email and password
**Then** a Supabase Auth user account is created
**And** I am redirected to the dashboard

**Given** I am on the registration page
**When** I submit an email that is already registered
**Then** I see a clear error message telling me the email is already taken
**And** no duplicate account is created

**Given** I am on the registration page
**When** I submit an invalid email format or a password shorter than 8 characters
**Then** I see a clear validation error
(Amended 2026-07-31 by code review of Story 1.1: the app enforces its own 8-character minimum, deliberately stricter than Supabase's default of 6, defined once in `app/(auth)/register/constants.ts`. The original "form is not submitted" clause was also softened — some formats the browser accepts, such as `a@b`, are rejected only by the server, so the form does submit and the error appears after a round trip.)

### Story 1.2: User Login

As a returning user,
I want to log in,
So that I can access my saved interview data.

**Acceptance Criteria:**

**Given** I have an existing account
**When** I submit my correct email and password
**Then** I am authenticated and redirected to the dashboard

**Given** I have an existing account
**When** I submit an incorrect password or an email that doesn't exist
**Then** I see a clear "invalid credentials" error
**And** I remain on the login page

**Given** I am not logged in
**When** I try to visit a protected page (dashboard, interviews)
**Then** I am redirected to the login page

### Story 1.3: Database Schema & RLS Setup

As the system,
I need the database schema in place with RLS,
So that each user's interview data is isolated and structured correctly.

**Acceptance Criteria:**

**Given** the Supabase project is set up
**When** the migration is applied
**Then** the `interviews`, `questions`, and `answers` tables exist, matching the Architecture §4 schema

**Given** RLS is enabled
**When** an authenticated user queries `interviews`
**Then** only rows where `user_id = auth.uid()` are returned

**Given** RLS is enabled
**When** an authenticated user queries `questions` or `answers`
**Then** only rows belonging to interviews they own (via `interview_id` join) are returned

**Given** a request is unauthenticated
**When** it attempts to query any of the three tables directly
**Then** no rows are returned (RLS blocks anonymous access)

## Epic 2: Interview Intake

Users can start a new interview session by choosing role/level/type/difficulty/duration, uploading a resume (auto-parsed to text, editable before saving), and pasting a job description.

*Scope note: these 3 stories cover filling out and validating the intake form (client-side state + the resume-parse endpoint) only. The actual "Start Interview" click — which creates the `interviews` row and generates question #1 in one AI call — belongs to Epic 3 Story 3.1, per Architecture (`POST /api/interviews` does both in one call).*

### Story 2.1: Select Interview Parameters

As a user,
I want to select role/level/type/difficulty/duration,
So that the interview matches what I'm preparing for.

**Acceptance Criteria:**

**Given** I am on the "New Interview" page
**When** the form loads
**Then** I see selectors for role (Frontend/Backend/Fullstack/Mobile/DevOps), level (Intern/Fresher/Junior/Middle), interview type (Technical/Behavioral/Mixed), difficulty, and duration (15/30/45/60 minutes)

**Given** I select a duration
**When** the form computes `max_questions`
**Then** it maps correctly: 15min→3, 30min→5, 45min→7, 60min→9

**Given** I have not selected all required fields
**When** I try to proceed to the next step
**Then** I see a validation message and cannot continue

### Story 2.2: Upload and Parse Resume

As a user,
I want to upload my resume (PDF/DOCX),
So that the AI has real context about my background.

**Acceptance Criteria:**

**Given** I am on the New Interview page
**When** I upload a `.pdf` or `.docx` file
**Then** the server extracts the text via `pdf-parse`/`mammoth` and returns it to me

**Given** the file has been parsed
**Then** the original file is discarded immediately after extraction and is never written to any storage (NFR3)

**Given** text has been extracted
**When** it is returned to the page
**Then** it appears in an editable textarea, and I can correct any extraction errors before continuing (FR4, UX-DR3)

**Given** I try to upload a file that is not `.pdf` or `.docx`
**When** I select it
**Then** I see a clear error and the upload is rejected (NFR5)

**Given** the uploaded file is corrupted, password-protected, or otherwise fails text extraction
**When** parsing fails
**Then** I see a clear error message and can retry with a different file

### Story 2.3: Provide Job Description

As a user,
I want to paste a job description,
So that questions are relevant to the specific role I'm applying for.

**Acceptance Criteria:**

**Given** I am on the New Interview page
**When** I paste text into the job description textarea
**Then** it is held as `job_description`, ready to be sent when I start the interview

**Given** the job description is required
**When** I leave it empty and try to proceed to start the interview
**Then** I see a validation message requiring a job description, since the AI needs it as core context for question generation

## Epic 3: AI Interview Session Engine

The core loop works end-to-end: AI asks a tailored first question, evaluates each answer on 3 criteria, asks an adaptive next question using full conversation history, and the session ends automatically at the right question count.

### Story 3.1: Generate First Question & Start Interview

As a user,
I want the AI to ask me a first question based on my resume and job description,
So that the interview feels tailored from the start.

**Acceptance Criteria:**

**Given** I have completed the intake form (role/level/type/difficulty/duration/resume/JD)
**When** I click "Start Interview"
**Then** a new `interviews` row is created with `status = 'in_progress'` and all intake fields saved

**Given** the interview row is created
**When** the system calls the AI
**Then** a system prompt is built from resume text + job description + role/level/difficulty, and the AI generates question #1

**Given** the AI returns question #1
**Then** it is persisted to `questions` with `order_index = 1`
**And** I am taken to the Interview Session screen showing this question (UX-DR2: one question, distraction-free)

**Given** the AI response fails schema validation
**When** parsing fails
**Then** the system retries the call up to 2 times (NFR1)
**And** if all retries fail, I see a clear error and no broken/half-created interview is left behind

### Story 3.2: Submit Answer, Get Evaluated, Get Next Question

As a user,
I want to submit an answer and get evaluated + asked the next question,
So that the interview progresses naturally.

**Acceptance Criteria:**

**Given** I am viewing the current question
**When** I submit my free-text answer
**Then** the API reconstructs the full conversation history (system prompt + all prior Q&A as alternating turns) before calling the AI (NFR7)

**Given** the conversation history is reconstructed
**When** a single AI call is made
**Then** it returns scores for the 3 criteria (technical, problem-solving, communication) + written feedback + the next question, all validated against a defined JSON schema (NFR1, NFR6)

**Given** the AI response fails schema validation
**When** parsing fails
**Then** the system retries up to 2 times with the validation error appended to the prompt
**And** if it still fails, I see a clear error instead of a crash or silent failure

**Given** my most recent answer scored strongly
**When** the next question is generated
**Then** its difficulty increases

**Given** my most recent answer scored weakly
**When** the next question is generated
**Then** its difficulty decreases / becomes more guided

**Given** the answer has been evaluated and saved
**Then** my score and feedback are shown before I see the next question

### Story 3.3: Auto-End Session at Question Limit

As the system,
I need the session to end automatically at the right question count,
So that sessions have a predictable length.

**Acceptance Criteria:**

**Given** answering the current question brings `order_index` to `max_questions`
**When** that answer is evaluated
**Then** no further question is generated

**Given** the last answer has been evaluated and `max_questions` is reached
**Then** the interview is marked as finished (session no longer accepts new answers)
**And** I am shown a transition to the final report flow (Epic 4) instead of another answer box

## Epic 4: Final Report

On finishing a session, the user gets an AI-generated report: overall score, 3 strengths, 3 weaknesses, 3-week roadmap.

### Story 4.1: Generate Final Report

As a user,
I want a final report after finishing a session,
So that I know what to work on.

**Acceptance Criteria:**

**Given** the interview has reached `max_questions` and the last answer is evaluated
**When** report generation is triggered
**Then** a single AI call aggregates all Q&A + scores into: overall score, exactly 3 strengths, exactly 3 weaknesses, and a 3-week improvement roadmap, validated against a JSON schema (NFR1)

**Given** the AI response fails schema validation
**When** parsing fails
**Then** the system retries up to 2 times
**And** if it still fails, I see a clear error with a way to retry report generation manually, instead of my interview being permanently stuck with no report

**Given** the report is generated successfully
**Then** it is persisted on the `interviews` row (`overall_score`, `strengths`, `weaknesses`, `roadmap`) and `status` is set to `'completed'`

**Given** the interview is `'completed'`
**When** I view the Final Report page
**Then** I see the overall score, 3 strengths, 3 weaknesses, and the 3-week roadmap rendered clearly

## Epic 5: Dashboard & History

Users can see their progress over time (stats + skill chart) and revisit any past session in full detail.

### Story 5.1: Dashboard

As a user,
I want a dashboard summarizing my activity,
So that I can see how I'm improving.

**Acceptance Criteria:**

**Given** I have completed at least one interview
**When** I visit the dashboard
**Then** I see total sessions completed, average score, and a list of recent sessions

**Given** I have completed 2 or more interviews
**When** I view the dashboard
**Then** I see a skill-progress chart (Recharts) showing my score trend over time (UX-DR4)

**Given** I have not completed any interviews yet
**When** I visit the dashboard
**Then** I see an empty state that guides me to start my first interview

### Story 5.2: Session History

As a user,
I want to browse and reopen past sessions,
So that I can review specific answers and feedback.

**Acceptance Criteria:**

**Given** I have one or more completed interviews
**When** I visit the history page
**Then** I see a list showing date, role, level, duration, and score for each session

**Given** I select a past session from the list
**When** I open it
**Then** I see every question, my answer, and its evaluation (scores + feedback) from that session, plus the final report

**Given** an interview is still `'in_progress'` (not completed)
**When** I look at the history list
**Then** it does not appear there — only completed sessions show in history, and in-progress sessions are not resumable or shown anywhere

## Epic 6: Deployment & Documentation

The project is live on a public URL and documented well enough for a recruiter/interviewer to understand it quickly.

### Story 6.1: Deploy to Vercel

As the author,
I want the app deployed on Vercel,
So that anyone can try it via a live link.

**Acceptance Criteria:**

**Given** the codebase builds successfully locally (`npm run build`)
**When** it is connected to Vercel via the GitHub repo
**Then** it deploys successfully on the Vercel Hobby (free) tier (NFR4)

**Given** the app is deployed
**When** environment variables are needed (Supabase URL/keys, Anthropic API key)
**Then** they are configured only in the Vercel dashboard, never committed to the repository

**Given** the deployed app is visited
**When** a user completes the full flow (register → create interview → answer → view report)
**Then** it works end-to-end in production, matching local behavior

### Story 6.2: Write README

As the author,
I want a clear README,
So that recruiters and interviewers understand the project quickly.

**Acceptance Criteria:**

**Given** the project is complete and deployed
**When** someone opens the README
**Then** it states the problem being solved, includes a screenshot or GIF, summarizes the architecture, and gives local run instructions

**Given** the README is read by a technical reviewer
**Then** it includes a "future direction" section noting deferred ideas (adaptive memory across sessions, skill tree, AI coach) as evidence of product thinking beyond MVP scope
