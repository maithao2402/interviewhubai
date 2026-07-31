'use client'

import { useActionState } from 'react'
import { registerAction, type RegisterState } from './actions'
import { MAX_EMAIL_LENGTH, MAX_PASSWORD_BYTES, MIN_PASSWORD_LENGTH } from './constants'

const initialState: RegisterState = {}

const ERROR_ID = 'register-error'

export default function RegisterPage() {
  const [state, formAction, pending] = useActionState(registerAction, initialState)
  const hasError = Boolean(state?.error)

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <form action={formAction} className="w-full max-w-sm space-y-4">
        <h1 className="text-xl font-semibold">Create your account</h1>

        {/* A disabled fieldset switches off every control at once. Disabling
            only the button still lets Enter inside a text field fire a second
            submit, which burns another signup attempt against the rate limit. */}
        <fieldset disabled={pending} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="email" className="block text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              maxLength={MAX_EMAIL_LENGTH}
              defaultValue={state?.email ?? ''}
              aria-invalid={hasError}
              aria-describedby={hasError ? ERROR_ID : undefined}
              className="w-full rounded border border-gray-300 px-3 py-2"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="password" className="block text-sm font-medium">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={MIN_PASSWORD_LENGTH}
              maxLength={MAX_PASSWORD_BYTES}
              aria-invalid={hasError}
              aria-describedby={hasError ? ERROR_ID : undefined}
              className="w-full rounded border border-gray-300 px-3 py-2"
            />
          </div>

          {/* Always in the DOM, only the text changes. A live region that is
              inserted at the same moment as its message is often missed by
              screen readers. role="alert" already implies assertive, so no
              aria-live attribute is set alongside it.

              The key changes on every failed attempt: resubmitting the same bad
              input yields the same string, and an unchanged live region is not
              re-announced. Remounting the node forces the announcement. */}
          <p
            key={state?.attempt ?? 0}
            id={ERROR_ID}
            role="alert"
            className="min-h-5 text-sm text-red-600"
          >
            {state?.error ?? ''}
          </p>

          <button
            type="submit"
            className="w-full rounded bg-black px-3 py-2 text-white disabled:opacity-50"
          >
            {pending ? 'Registering...' : 'Register'}
          </button>
        </fieldset>
      </form>
    </main>
  )
}
