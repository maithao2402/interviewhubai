'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { MAX_EMAIL_LENGTH } from '../register/constants'

export type LoginState = {
  error?: string
  /** Echoed back so the form can refill the field after a failed submit. */
  email?: string
  /**
   * Incremented on every failed attempt, used as a React key on the error
   * element so a repeated identical message is still re-announced by screen
   * readers. Same pattern as the register form.
   */
  attempt?: number
}

/**
 * One message for every credential failure.
 *
 * AC2 requires that a wrong password and an unknown email look identical. If
 * they differ, the form tells an attacker which addresses have accounts — they
 * just watch which error comes back. Supabase already returns a single
 * `invalid_credentials` code for both cases. `user_not_found` is mapped to the
 * same string for the same reason, and so are `email_address_invalid` and
 * `validation_failed` — the two shapes GoTrue can use for "this address is
 * malformed." Without them, an obviously malformed address would fall through
 * to `GENERIC_ERROR` below and produce a third, distinguishable message —
 * still a leak, just a different shape of one.
 *
 * `email_not_confirmed` and `user_banned` are mapped to their own honest
 * messages, not to `INVALID_CREDENTIALS`. AC2 only requires parity between
 * "wrong password" and "unknown email" — an unconfirmed or banned account is a
 * different, real state, and telling the user the truth about it is not an
 * enumeration risk.
 *
 * Note this is the deliberate opposite of the register form, which DOES say
 * "this email is already registered" because its own AC2 demands it. That
 * asymmetry is intentional — see Story 1.1, Decision 1.
 */
const INVALID_CREDENTIALS = 'Invalid email or password.'

const ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: INVALID_CREDENTIALS,
  user_not_found: INVALID_CREDENTIALS,
  email_address_invalid: INVALID_CREDENTIALS,
  validation_failed: INVALID_CREDENTIALS,
  email_not_confirmed: 'Please confirm your email before logging in — check your inbox for the confirmation link.',
  user_banned: 'This account has been suspended.',
  over_request_rate_limit: 'Too many attempts. Please wait a few minutes, then try again.',
  // Unlike signup_disabled (a sign-up-endpoint-only code, pruned from this
  // map), this fires when the email/password provider itself is off — which
  // blocks sign-in too, so it stays.
  email_provider_disabled: 'Sign-in is temporarily unavailable. Please try again later.',
}

const GENERIC_ERROR = 'Could not sign you in. Please try again.'

export async function loginAction(
  prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const attempt = (prevState.attempt ?? 0) + 1

  const rawEmail = formData.get('email')
  const password = formData.get('password')

  if (typeof rawEmail !== 'string' || typeof password !== 'string') {
    return {
      error: 'Please fill in both email and password.',
      email: typeof rawEmail === 'string' ? rawEmail.trim() : '',
      attempt,
    }
  }

  const email = rawEmail.trim()

  // Login validates only that the fields are filled in. It deliberately does
  // NOT apply the register form's 8-character minimum: that rule belongs to
  // account creation, and enforcing it here would lock out any account made
  // under a different rule (Supabase's own default minimum is 6). Whether the
  // credentials are correct is Supabase's decision, not this form's.
  if (email.length === 0 || password.length === 0) {
    return { error: 'Please fill in both email and password.', email, attempt }
  }

  // The client-side maxLength on the input is not a security control — it's
  // bypassable via a direct POST. Reject an out-of-range email before it ever
  // reaches Supabase. Uses the same INVALID_CREDENTIALS message as every other
  // failure below it, for the same anti-enumeration reason.
  if (email.length > MAX_EMAIL_LENGTH) {
    return { error: INVALID_CREDENTIALS, email, attempt }
  }

  // Built outside the try below, so a missing environment variable surfaces as
  // its own named error instead of being flattened into the generic message.
  let supabase
  try {
    supabase = await createClient()
  } catch (err) {
    console.error('[login] could not create the Supabase client', err)
    return {
      error: 'The app is not configured correctly. Please try again later.',
      email,
      attempt,
    }
  }

  let loginError: string | null = null

  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      const known = ERROR_MESSAGES[error.code ?? '']

      // A wrong password is an expected outcome, not a system fault: logging it
      // at error level would fill production alerts with ordinary typos.
      const log = known ? console.warn : console.error
      log('[login] signInWithPassword failed', {
        code: error.code,
        status: error.status,
        message: error.message,
      })

      loginError = known ?? GENERIC_ERROR
    } else if (!data.session) {
      // Should not happen on a successful sign-in, but never infer success from
      // the absence of an error — that exact assumption broke Story 1.1's AC1.
      console.error('[login] signInWithPassword returned no session')
      loginError = GENERIC_ERROR
    }
  } catch (err) {
    console.error('[login] unexpected error', err)
    loginError = 'Something went wrong. Please try again.'
  }

  if (loginError) {
    return { error: loginError, email, attempt }
  }

  // redirect() throws NEXT_REDIRECT internally, so it must stay outside the
  // try/catch — a catch block would swallow it and nothing would happen.
  redirect('/dashboard')
}
