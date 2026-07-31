---
project_name: 'InterviewHub AI'
user_name: 'Thao Thao'
date: '2026-07-20'
sections_completed: ['technology_stack', 'critical_rules']
---

# Project Context for AI Agents

## Technology Stack & Versions
- Next.js (App Router, latest — currently 16.x), TypeScript, Tailwind CSS
- Database & Auth: Supabase (Postgres + Auth), RLS enabled on every table
- AI: Anthropic API, structured output via tool use — never free-text JSON parsing
- Schema validation: `zod` for all API inputs and AI responses
- Resume parsing: `pdf-parse` (PDF), `mammoth` (DOCX) — no other formats supported
- Charts: Recharts (dashboard)
- Deploy target: Vercel (Hobby/free tier)

## Critical Implementation Rules
- File/folder naming: kebab-case. Components: PascalCase.
- All AI calls must go through a single shared function in `lib/ai/` — never call the AI API ad hoc from inside a route handler.
- Every API route wraps its logic in try/catch and returns `{ error: string }` with an appropriate HTTP status code.
- Never hardcode secrets — always read from `process.env`.
- The uploaded resume file must NEVER be persisted to storage. Extract text, then discard the file immediately.
- Evaluation is limited to exactly 3 criteria: technical knowledge, problem-solving, communication (text clarity/structure). Do not add criteria that require audio/video signal (confidence, tone).
- Do not introduce NestJS, Redis, BullMQ, or Docker — this project intentionally stays on Next.js API Routes + Supabase only.
- No automated test suite is required for this MVP; manual testing against the core flow is sufficient before each deploy.
- Every stateless API call must reconstruct full conversation context from the database (system prompt + all prior Q&A as alternating turns) — never assume in-memory state persists between requests.

## Working Style
- The user is learning to code and relies on the agent to write code directly (vibe coding), but must be able to explain the project in a job interview afterward.
- Before writing each new piece of functionality, briefly explain the approach and why it was chosen.
- After writing each piece, summarize in plain language what it does and where it's easy to break.
- For non-obvious logic (AI JSON parsing, conversation context handling, RLS policies), always explain *why*, not just *what*.
- When communicating in English, use simple vocabulary and short, plain sentences — the user is learning technical English.