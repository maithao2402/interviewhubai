/**
 * Single source of truth for the registration form's limits.
 *
 * The Server Action and the form both import these. They used to be two
 * separate literals (`MIN_PASSWORD_LENGTH` in the action, `minLength={8}` in
 * the page) that could drift apart silently.
 *
 * Note: 8 is this app's own rule, deliberately stricter than Supabase's
 * default minimum of 6. See AC3.
 */
export const MIN_PASSWORD_LENGTH = 8

/** bcrypt only hashes the first 72 bytes — anything longer is truncated. */
export const MAX_PASSWORD_BYTES = 72

/** Practical maximum length of an email address (RFC 5321). */
export const MAX_EMAIL_LENGTH = 254
