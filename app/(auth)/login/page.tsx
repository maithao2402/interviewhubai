'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { FormAlert } from '@/components/form-alert'
import { SubmitButton } from '@/components/submit-button'
import { TextField } from '@/components/text-field'
import { loginAction, type LoginState } from './actions'
import { MAX_EMAIL_LENGTH } from '../register/constants'

const initialState: LoginState = {}

const ERROR_ID = 'login-error'

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(loginAction, initialState)
  const hasError = Boolean(state?.error)

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <form action={formAction} className="w-full max-w-sm space-y-4">
        <h1 className="text-xl font-semibold">Log in</h1>

        <fieldset disabled={pending} className="space-y-4">
          <TextField
            id="email"
            name="email"
            label="Email"
            type="email"
            autoComplete="email"
            maxLength={MAX_EMAIL_LENGTH}
            defaultValue={state?.email ?? ''}
            invalid={hasError}
            describedBy={ERROR_ID}
          />

          {/* current-password, not new-password: this field reads an existing
              credential, so password managers should offer to fill it rather
              than generate a new one. No length limits either — those belong to
              registration, and applying them here would lock out accounts
              created under a different rule. */}
          <TextField
            id="password"
            name="password"
            label="Password"
            type="password"
            autoComplete="current-password"
            invalid={hasError}
            describedBy={ERROR_ID}
          />

          <FormAlert id={ERROR_ID} message={state?.error} attempt={state?.attempt} />

          <SubmitButton pending={pending} label="Log in" pendingLabel="Logging in..." />
        </fieldset>

        <p className="text-sm">
          Don&apos;t have an account?{' '}
          <Link href="/register" className="underline">
            Register
          </Link>
        </p>
      </form>
    </main>
  )
}
