/**
 * Single source of truth for the interview intake parameters (FR2, FR10).
 *
 * These strings are a CONTRACT WITH THE DATABASE, not just UI labels. The live
 * `interviews` table (Architecture §4, applied in Story 1.3) constrains three of
 * them with case-sensitive `check` clauses:
 *
 *   role            in ('Frontend','Backend','Fullstack','Mobile','DevOps')
 *   level           in ('Intern','Fresher','Junior','Middle')
 *   interview_type  in ('Technical','Behavioral','Mixed')
 *
 * A typo here is invisible to TypeScript and to the form. It only surfaces when
 * Story 3.1 inserts the row, as SQLSTATE 23514 — after the user has filled in
 * the whole form. Story 1.3's own log records this happening with `level='Mid'`.
 * If a value changes, change the migration in the same commit.
 */

export const ROLES = ['Frontend', 'Backend', 'Fullstack', 'Mobile', 'DevOps'] as const
export type Role = (typeof ROLES)[number]

export const LEVELS = ['Intern', 'Fresher', 'Junior', 'Middle'] as const
export type Level = (typeof LEVELS)[number]

export const INTERVIEW_TYPES = ['Technical', 'Behavioral', 'Mixed'] as const
export type InterviewType = (typeof INTERVIEW_TYPES)[number]

/**
 * Difficulty is the odd one out: `difficulty text not null` has NO check
 * constraint, deliberately — Architecture §4's rule is "constrain only what a
 * planning document actually fixes", and no PRD/epic/architecture section ever
 * fixes the difficulty values.
 *
 * So this line IS the definition. Nothing in the database will catch a
 * mismatch. Epic 3's prompt building must import from here rather than writing
 * its own strings.
 */
export const DIFFICULTIES = ['Easy', 'Medium', 'Hard'] as const
export type Difficulty = (typeof DIFFICULTIES)[number]

/**
 * FR10's duration → question-count mapping, kept as ONE table rather than two
 * parallel lists.
 *
 * The database checks the two columns as a PAIR:
 *   check ((duration_minutes, max_questions) in ((15,3),(30,5),(45,7),(60,9)))
 *
 * So `{duration_minutes: 15, max_questions: 5}` is rejected even though 15 and
 * 5 are each individually legal. Any second lookup table could drift from this
 * one and produce exactly that rejection — hence `maxQuestionsFor()` below is
 * the only reader, and there must not be a second one.
 */
export const DURATION_OPTIONS = [
  { minutes: 15, maxQuestions: 3 },
  { minutes: 30, maxQuestions: 5 },
  { minutes: 45, maxQuestions: 7 },
  { minutes: 60, maxQuestions: 9 },
] as const

export type DurationMinutes = (typeof DURATION_OPTIONS)[number]['minutes']

export function maxQuestionsFor(minutes: DurationMinutes): number {
  const option = DURATION_OPTIONS.find((candidate) => candidate.minutes === minutes)

  // Unreachable through the type system, but reachable from any future caller
  // that parses an untyped value (a JSON request body, a URL param). Throwing
  // here beats returning a number the database will reject later.
  if (!option) {
    throw new Error(`Unsupported interview duration: ${minutes} minutes`)
  }

  return option.maxQuestions
}

/** The intake form once every field has been chosen. */
export type CompleteIntake = {
  role: Role
  level: Level
  interviewType: InterviewType
  difficulty: Difficulty
  durationMinutes: DurationMinutes
}

/**
 * The intake form while it is being filled in. Every field can still be `''`.
 *
 * The empty state is required, not incidental: if each selector started on its
 * first real option, "I have not selected all required fields" (AC3) could
 * never happen and the validation branch would be dead code that looks
 * implemented. It also keeps "the user chose Frontend" distinguishable from
 * "the user never looked at this field" — a difference that matters, because
 * Epic 3 sends these values straight into a paid AI call as interview context.
 *
 * Stories 2.2 and 2.3 extend this type with `resumeText` and `jobDescription`.
 */
export type InterviewIntake = {
  [K in keyof CompleteIntake]: CompleteIntake[K] | ''
}

export const EMPTY_INTAKE: InterviewIntake = {
  role: '',
  level: '',
  interviewType: '',
  difficulty: '',
  durationMinutes: '',
}
