# InterviewHub AI — Product Requirements Document (PRD)

## 1. Goals and Background Context

### Goals
- Give job seekers a realistic way to rehearse technical interviews before the real thing
- Generate interview questions grounded in the candidate's actual resume and the target job description
- Provide structured, multi-criteria feedback on each answer, not just a pass/fail score
- Help the candidate see their improvement over time and know what to study next
- Ship a working, deployed MVP within a 1-month solo build

### Background Context
Candidates preparing for technical interviews have no realistic way to rehearse. Asking friends for mock interviews lacks depth; reading sample questions online gives no feedback. InterviewHub AI simulates a real technical interview: the AI interviewer asks questions informed by the candidate's resume and the job description, evaluates each answer against defined criteria, and produces a final report with concrete next steps. The author is building this for their own job search, which grounds the scope in real, first-hand need rather than speculative requirements.

### Change Log
| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-20 | 0.1 | Initial PRD drafted from project overview doc | — |

---

## 2. Requirements

### Functional Requirements

1. **FR1**: Users can register and log in with email/password (Supabase Auth).
2. **FR2**: Users can create a new interview session by selecting: role (Frontend/Backend/Fullstack/Mobile/DevOps), experience level (Intern/Fresher/Junior/Middle), interview type (Technical/Behavioral/Mixed), difficulty, and duration (15/30/45/60 minutes).
3. **FR3**: Users can upload a resume file in PDF or DOCX format; the system extracts its text content automatically.
4. **FR4**: Users can review and manually edit the extracted resume text before it is saved, to correct any extraction errors.
5. **FR5**: Users can paste a job description as free text.
6. **FR6**: The system generates the first interview question via AI, using role, level, interview type, difficulty, resume text, and job description as context.
7. **FR7**: Users submit a free-text answer to each question.
8. **FR8**: The system evaluates each answer via AI on three criteria — technical knowledge, problem-solving, and communication (clarity/structure of the written answer) — each scored 0–10, with written feedback.
9. **FR9**: The system generates the next question via AI, using the full prior conversation (all previous questions and answers in the session) as context, adjusting difficulty based on recent performance.
10. **FR10**: The session automatically ends once the number of questions reaches the limit set by the chosen duration (15min→3, 30min→5, 45min→7, 60min→9).
11. **FR11**: On session completion, the system generates a final report via AI: overall score, three strengths, three weaknesses, and a 3-week improvement roadmap.
12. **FR12**: Users can view a dashboard: total sessions completed, average score, recent sessions, and skill progress over time.
13. **FR13**: Users can view a history of all past sessions and reopen any one to review its questions, answers, per-answer scores, and final report.

### Optional / Nice-to-Have Requirements (post-MVP if time allows)

14. **FR14**: Users can sign in with Google.
15. **FR15**: A live countdown timer is shown during each question.
16. **FR16**: Users can compare their scores across different interview types.
17. **FR17**: Before the interview starts, the system runs a "Job Gap Analysis" comparing resume skills against job description requirements, and uses the gaps to bias question selection toward weak areas.
18. **FR18**: A "Stress Mode" enforces stricter per-answer time limits and auto-submits when time expires.

### Non-Functional Requirements

1. **NFR1**: All AI responses that the application parses as data (question generation, evaluation, final report) must be constrained to a defined JSON schema; on a parsing/validation failure, the system retries the AI call up to 2 times before surfacing a clear error to the user.
2. **NFR2**: Row Level Security (RLS) must be enabled on every database table so a user can only read or write their own data.
3. **NFR3**: The uploaded resume file must never be persisted to storage — it is parsed for text and discarded immediately after extraction.
4. **NFR4**: The application must run within the free tiers of its hosting/database providers (no paid infrastructure required for personal/portfolio-scale usage).
5. **NFR5**: Resume upload only needs to support PDF and DOCX formats.
6. **NFR6**: Evaluation criteria are limited to what is reasonably inferable from text alone (technical knowledge, problem-solving, written communication clarity). Criteria that require audio/video signal (confidence, tone of voice, body language) are explicitly out of scope for this text-based MVP.
7. **NFR7**: The interview session must maintain full conversational context across multiple stateless API calls by reconstructing history from the database on every request (no reliance on in-memory server state).

---

## 3. UI/UX Goals

### Key Screens
- Login / Register
- Dashboard (stats + skill progress chart + recent sessions)
- New Interview (role/level/type/difficulty/duration selectors + resume upload + JD textarea)
- Interview Session (current question, answer input, submit)
- Final Report (score, strengths, weaknesses, roadmap)
- Session History (list + detail view of any past session)

### Design Principles
- Keep the interview session screen distraction-free — one question and one answer box at a time
- Make the extracted resume text editable and visible before it's used, so users trust what the AI is working from
- Dashboard should visually communicate improvement over time (score trend), not just a static number

---

## 4. Technical Assumptions

*(Full architecture detail — schema, API routes, prompt design — lives in the companion technical spec document; this section only states constraints the Architect must honor.)*

- **Repository structure**: single repository, no monorepo needed
- **Application structure**: Next.js (App Router) serves both frontend and backend (Route Handlers) — no separate backend service
- **Database & Auth**: Supabase (Postgres + Auth), with RLS enforced per NFR2
- **AI provider**: Anthropic API (or OpenAI), using structured/tool-based output per NFR1
- **Testing approach**: manual/exploratory testing is sufficient for this solo MVP; no formal automated test suite is required for launch
- **Deployment target**: Vercel (Hobby tier)

---

## 5. Epic List

1. **Epic 1 — Foundation & Auth**: Project setup, database schema, authentication.
2. **Epic 2 — Interview Intake**: Resume upload/parsing and job description capture as part of interview creation.
3. **Epic 3 — AI Interview Session Engine**: The core question → answer → evaluation → next-question loop.
4. **Epic 4 — Final Report**: Session completion and AI-generated report.
5. **Epic 5 — Dashboard & History**: Stats, skill progress, and session history views.
6. **Epic 6 — Deployment & Documentation**: Polish, deploy, README.

---

## 6. Epic Details

### Epic 1 — Foundation & Auth
**Goal**: A user can create an account, log in, and the database is ready to store interview data securely.

- **Story 1.1**: As a new user, I want to register with email/password, so that I have an account.
  - AC1: Registration form collects email + password
  - AC2: On success, a Supabase Auth user is created and the user is redirected to the dashboard
  - AC3: Duplicate email shows a clear error
- **Story 1.2**: As a returning user, I want to log in, so that I can access my data.
  - AC1: Login form authenticates against Supabase Auth
  - AC2: Invalid credentials show a clear error
- **Story 1.3**: As the system, I need the database schema in place with RLS, so that user data is isolated and structured correctly.
  - AC1: `interviews`, `questions`, `answers` tables created per the technical spec
  - AC2: RLS policies restrict all three tables to `auth.uid() = user_id` (directly or via join)

### Epic 2 — Interview Intake
**Goal**: A user can start a new interview session by providing their resume, the job description, and session parameters.

- **Story 2.1**: As a user, I want to select role/level/type/difficulty/duration, so that the interview matches what I'm preparing for.
  - AC1: Form exposes all five fields with the defined option sets
  - AC2: `max_questions` is derived from the selected duration
- **Story 2.2**: As a user, I want to upload my resume (PDF/DOCX), so that the AI has real context about my background.
  - AC1: Upload accepts only `.pdf`/`.docx`
  - AC2: Server extracts text via `pdf-parse`/`mammoth`
  - AC3: The original file is discarded immediately after extraction (never persisted)
  - AC4: Extracted text is shown in an editable textarea before saving
- **Story 2.3**: As a user, I want to paste a job description, so that questions are relevant to the specific role I'm applying for.
  - AC1: Free-text textarea, stored as `job_description`

### Epic 3 — AI Interview Session Engine
**Goal**: The core interview loop works end-to-end with reliable AI output.

- **Story 3.1**: As a user, I want the AI to ask me a first question based on my resume/JD, so that the interview feels tailored.
  - AC1: On interview creation, an AI call generates question #1 using system prompt built from resume/JD/role/level/difficulty
  - AC2: Question is persisted to `questions` with `order_index = 1`
- **Story 3.2**: As a user, I want to submit an answer and get evaluated + asked the next question, so that the interview progresses naturally.
  - AC1: The API reconstructs full conversation history (system prompt + all prior Q&A as alternating turns) before calling the AI
  - AC2: A single AI call returns evaluation scores (3 criteria) + feedback + next question, validated against a JSON schema
  - AC3: On validation failure, retry up to 2 times before returning an error to the client
  - AC4: Difficulty of the next question adapts based on the most recent score (harder if strong, easier/more guided if weak)
- **Story 3.3**: As the system, I need the session to end automatically at the right question count, so that sessions have a predictable length.
  - AC1: Once `order_index` reaches `max_questions`, no further question is generated and `status` moves toward completion

### Epic 4 — Final Report
**Goal**: On completion, the user receives an actionable summary of their performance.

- **Story 4.1**: As a user, I want a final report after finishing a session, so that I know what to work on.
  - AC1: An AI call aggregates all Q&A + scores into: overall score, 3 strengths, 3 weaknesses, 3-week roadmap
  - AC2: Report is persisted on the `interviews` row and `status` set to `completed`
  - AC3: Report page renders all fields clearly

### Epic 5 — Dashboard & History
**Goal**: The user can see progress over time and revisit past sessions.

- **Story 5.1**: As a user, I want a dashboard summarizing my activity, so that I can see how I'm improving.
  - AC1: Shows total sessions, average score, recent sessions list
  - AC2: Shows a skill-progress chart over time (Recharts)
- **Story 5.2**: As a user, I want to browse and reopen past sessions, so that I can review specific answers and feedback.
  - AC1: History list shows date, role, level, duration, score per session
  - AC2: Opening a session shows every question, answer, and evaluation from that session

### Epic 6 — Deployment & Documentation
**Goal**: The project is live, demoable, and documented for a CV/portfolio audience.

- **Story 6.1**: As the author, I want the app deployed on Vercel, so that anyone can try it via a live link.
  - AC1: Production build succeeds and deploys on Vercel Hobby tier
  - AC2: Environment variables (Supabase keys, AI API key) are configured server-side only
- **Story 6.2**: As the author, I want a clear README, so that recruiters and interviewers understand the project quickly.
  - AC1: README states the problem, screenshots/GIF, architecture summary, and local run instructions
  - AC2: README includes a "future direction" section noting deferred ideas (adaptive memory across sessions, skill tree, AI coach) as evidence of product thinking beyond MVP scope

---

## 7. Out of Scope for MVP
- Dedicated backend service (NestJS), Redis/BullMQ, Docker/CI-CD pipeline
- Voice-based interviews, real-time streaming AI responses
- Persisting the original resume file
- Cross-session memory / adaptive long-term coaching (see Epic 6, Story 6.2 — documented as future direction instead)