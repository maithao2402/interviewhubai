'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { MAX_EMAIL_LENGTH, MAX_PASSWORD_BYTES, MIN_PASSWORD_LENGTH } from './constants'

export type RegisterState = {
  error?: string
  /** Echoed back so the form can refill the field after a failed submit. */
  email?: string
  /**
   * Incremented on every failed attempt. The form uses it as a React key on the
   * error element: resubmitting the same bad input produces the same message,
   * and a live region whose text never changes is not re-announced by screen
   * readers. Changing the key remounts the node so the message is announced
   * again.
   */
  attempt?: number
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Supabase error codes we can phrase for a user.
 *
 * Matching on `error.code` rather than on the message text: the code is the
 * stable contract (typed as `ErrorCode` in @supabase/auth-js), while the
 * message is English prose that can be reworded upstream at any time.
 *
 * Anything not listed here is replaced with a generic message on purpose. The
 * raw text from the auth API is written for developers, not end users, and it
 * leaks backend state — a live test of this form displayed the literal string
 * "email rate limit exceeded" to the browser.
 */
const ERROR_MESSAGES: Record<string, string> = {
  email_exists: 'This email is already registered.',
  user_already_exists: 'This email is already registered.',
  email_address_invalid: 'Please enter a valid email address.',
  weak_password: 'Please choose a stronger password.',
  over_email_send_rate_limit: 'Too many attempts. Please wait a few minutes, then try again.',
  over_request_rate_limit: 'Too many attempts. Please wait a few minutes, then try again.',
  signup_disabled: 'Registration is temporarily unavailable. Please try again later.',
  email_provider_disabled: 'Registration is temporarily unavailable. Please try again later.',
}

const GENERIC_ERROR = 'Could not create your account. Please try again.'

export async function registerAction(
  prevState: RegisterState,
  formData: FormData
): Promise<RegisterState> {
  // Every path out of this function except the final redirect is a failure, so
  // the counter only ever advances on errors.
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

  // Trim before validating. A pasted address often carries a leading space,
  // and EMAIL_REGEX rejects whitespace — without this the user is told their
  // address is invalid when it is actually fine.
  const email = rawEmail.trim()

  if (!EMAIL_REGEX.test(email)) {
    return { error: 'Please enter a valid email address.', email, attempt }
  }

  // Length gets its own branch: folding it into the format check above would
  // tell someone with a long-but-valid address that it is malformed.
  if (email.length > MAX_EMAIL_LENGTH) {
    return {
      error: `Email must be at most ${MAX_EMAIL_LENGTH} characters.`,
      email,
      attempt,
    }
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      email,
      attempt,
    }
  }

  // Eight spaces would otherwise pass the length check above and create a real
  // account. Only whitespace-*only* passwords are rejected — spaces inside or
  // around a real passphrase are legitimate and left untouched.
  if (password.trim().length === 0) {
    return { error: 'Password cannot be only spaces.', email, attempt }
  }

  // bcrypt hashes only the first 72 bytes, so a longer password is silently
  // truncated. The limit is counted in bytes, and the message says so: a
  // 30-character password using emoji or CJK can exceed 72 bytes, and
  // "72 characters" would look wrong to anyone who counted.
  if (new TextEncoder().encode(password).length > MAX_PASSWORD_BYTES) {
    return {
      error: `Password is too long — it must be at most ${MAX_PASSWORD_BYTES} bytes. Emoji and accented characters use more than one byte each.`,
      email,
      attempt,
    }
  }

  // Built outside the try below. createClient() throws a named error when an
  // environment variable is missing, and the catch around signUp() would
  // flatten that into a generic message — defeating the point of the check.
  let supabase
  try {
    supabase = await createClient()
  } catch (err) {
    console.error('[register] could not create the Supabase client', err)
    return {
      error: 'The app is not configured correctly. Please try again later.',
      email,
      attempt,
    }
  }

  let signUpError: string | null = null

  try {
    const { data, error } = await supabase.auth.signUp({ email, password })

    if (error) {
      const known = ERROR_MESSAGES[error.code ?? '']

      // Expected outcomes (duplicate email, weak password) are warnings, not
      // errors: logging routine typos at error level would trigger alerts in
      // production and bury genuine failures.
      const log = known ? console.warn : console.error
      log('[register] signUp failed', {
        code: error.code,
        status: error.status,
        message: error.message,
      })

      signUpError = known ?? GENERIC_ERROR
    } else if (data.user?.identities?.length === 0) {
      // Reached only when "Confirm email" is ON. To stop attackers probing
      // which emails have accounts, Supabase answers a duplicate signup with
      // success plus a fake user carrying no identities — never an error. With
      // only the `error` check above, a duplicate would look like a success.
      console.warn('[register] duplicate signup detected via empty identities')
      signUpError = 'This email is already registered.'
    } else if (!data.session) {
      // Deliberate fallback for a misconfigured project, NOT AC1 behaviour —
      // AC1 rules out a "check your email" step. Under the shipped config
      // ("Confirm email" OFF) this branch cannot fire. It exists so that if the
      // dashboard setting is ever flipped back on, the user is told the truth
      // instead of being dropped on /dashboard logged out.
      console.error(
        '[register] signUp returned no session — is "Confirm email" still ON in the Supabase project?'
      )
      signUpError =
        'Your account was created, but we could not sign you in. Please check your email to confirm your account.'
    }
  } catch (err) {
    console.error('[register] unexpected error', err)
    signUpError = 'Something went wrong. Please try again.'
  }

  if (signUpError) {
    return { error: signUpError, email, attempt }
  }

  // redirect() works by throwing NEXT_REDIRECT, which Next.js catches
  // internally. It must stay outside the try/catch above — a catch block would
  // swallow that throw and the redirect would never happen.
  redirect('/dashboard')
}
