'use client'

import { useState } from 'react'
import { FormAlert } from '@/components/form-alert'
import { SelectField } from '@/components/select-field'
import { SubmitButton } from '@/components/submit-button'
import {
  DIFFICULTIES,
  DURATION_OPTIONS,
  EMPTY_INTAKE,
  INTERVIEW_TYPES,
  LEVELS,
  ROLES,
  maxQuestionsFor,
  type CompleteIntake,
  type DurationMinutes,
  type InterviewIntake,
} from '@/lib/types/interview'

/**
 * `'use client'` because the whole page is state and change handlers. Pages are
 * Server Components by default in this Next.js version.
 *
 * Note this does NOT use `useActionState`, unlike the login and register pages.
 * That hook exists to surface errors coming back from a Server Action; nothing
 * here talks to the server, so plain `useState` is the honest choice.
 *
 * Route protection is already handled: `proxy.ts` lists `/interviews` in
 * PROTECTED_PREFIXES and matches by prefix, so a logged-out visitor is
 * redirected to /login before this component renders. Do not add a second check
 * here — the proxy's `getUser()` is verified against the Auth server, so a
 * page-level session check would be strictly weaker and could drift.
 */

const ERROR_ID = 'new-interview-error'

/** Select values are always strings in the DOM, so the numbers are stringified. */
const DURATION_VALUES = DURATION_OPTIONS.map((option) => String(option.minutes))

type IntakeErrors = Partial<Record<keyof InterviewIntake, string>>

function validate(intake: InterviewIntake): IntakeErrors {
  const errors: IntakeErrors = {}

  if (!intake.role) errors.role = 'Please select a role.'
  if (!intake.level) errors.level = 'Please select your experience level.'
  if (!intake.interviewType) errors.interviewType = 'Please select an interview type.'
  if (!intake.difficulty) errors.difficulty = 'Please select a difficulty.'
  if (!intake.durationMinutes) errors.durationMinutes = 'Please select a duration.'

  return errors
}

export default function NewInterviewPage() {
  const [intake, setIntake] = useState<InterviewIntake>(EMPTY_INTAKE)
  const [errors, setErrors] = useState<IntakeErrors>({})
  const [attempt, setAttempt] = useState(0)

  const hasErrors = Object.keys(errors).length > 0

  function update<K extends keyof InterviewIntake>(key: K, value: InterviewIntake[K]) {
    const next = { ...intake, [key]: value }
    setIntake(next)

    // Re-validate only after the user has actually tried to submit. Validating
    // from the first keystroke would show "please select a role" on a form the
    // user has barely started — and this way a fixed field's error clears the
    // moment it is fixed, instead of lingering until the next submit.
    if (attempt > 0) {
      setErrors(validate(next))
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const found = validate(intake)
    setErrors(found)

    if (Object.keys(found).length > 0) {
      // Only advances on failure. FormAlert uses it as a React key, so
      // submitting the same incomplete form twice remounts the message and
      // screen readers announce it again. Same pattern as the auth forms.
      setAttempt((previous) => previous + 1)
      return
    }

    // validate() is the single thing that decides "every field is filled in",
    // and an errors object cannot narrow a type. The cast records that
    // dependency rather than duplicating the emptiness checks in a type guard.
    const complete = intake as CompleteIntake

    // Story 3.1 replaces this with POST /api/interviews, which creates the
    // `interviews` row and generates question #1 in one call. Nothing is
    // persisted before then — this log exists so the derived max_questions can
    // be checked in the browser, and should be removed by that story.
    console.log('[new-interview] intake complete', {
      role: complete.role,
      level: complete.level,
      interview_type: complete.interviewType,
      difficulty: complete.difficulty,
      duration_minutes: complete.durationMinutes,
      max_questions: maxQuestionsFor(complete.durationMinutes),
    })
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      {/* noValidate turns off the browser's own validation so the messages
          above are the only ones the user ever sees. See select-field.tsx. */}
      <form onSubmit={handleSubmit} noValidate className="w-full max-w-md space-y-4">
        <h1 className="text-xl font-semibold">New interview</h1>

        {/* disabled is always false: nothing here is asynchronous yet. Story 3.1
            wires it to the same pending state SubmitButton below uses, matching
            the login/register double-submit-protection convention. */}
        <fieldset disabled={false} className="space-y-4">
          <SelectField
            id="role"
            name="role"
            label="Role"
            value={intake.role}
            onChange={(value) => update('role', value as InterviewIntake['role'])}
            options={ROLES}
            placeholder="Select a role"
            error={errors.role}
          />

          <SelectField
            id="level"
            name="level"
            label="Experience level"
            value={intake.level}
            onChange={(value) => update('level', value as InterviewIntake['level'])}
            options={LEVELS}
            placeholder="Select your experience level"
            error={errors.level}
          />

          <SelectField
            id="interview-type"
            name="interview_type"
            label="Interview type"
            value={intake.interviewType}
            onChange={(value) =>
              update('interviewType', value as InterviewIntake['interviewType'])
            }
            options={INTERVIEW_TYPES}
            placeholder="Select an interview type"
            error={errors.interviewType}
          />

          <SelectField
            id="difficulty"
            name="difficulty"
            label="Difficulty"
            value={intake.difficulty}
            onChange={(value) => update('difficulty', value as InterviewIntake['difficulty'])}
            options={DIFFICULTIES}
            placeholder="Select a difficulty"
            error={errors.difficulty}
          />

          <SelectField
            id="duration"
            name="duration_minutes"
            label="Duration"
            value={intake.durationMinutes === '' ? '' : String(intake.durationMinutes)}
            onChange={(value) =>
              update('durationMinutes', value === '' ? '' : (Number(value) as DurationMinutes))
            }
            options={DURATION_VALUES}
            placeholder="Select a duration"
            formatLabel={(minutes) => `${minutes} minutes`}
            error={errors.durationMinutes}
          />

          {/* Shows FR10's mapping in the UI rather than only in state — otherwise
              the duration → question-count rule cannot be checked without a
              debugger, and an untestable rule is one that silently rots. */}
          {intake.durationMinutes !== '' ? (
            <p className="text-sm text-gray-600">
              This interview will have {maxQuestionsFor(intake.durationMinutes)} questions.
            </p>
          ) : null}

          <FormAlert
            id={ERROR_ID}
            message={hasErrors ? 'Please choose a value for every field before starting.' : undefined}
            attempt={attempt}
          />

          {/* pending is always false: nothing here is asynchronous yet. Story 3.1
              wires it to the POST /api/interviews call. */}
          <SubmitButton pending={false} label="Start Interview" pendingLabel="Starting..." />
        </fieldset>
      </form>
    </main>
  )
}
