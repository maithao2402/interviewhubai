type FormAlertProps = {
  id: string
  message?: string
  /**
   * The current failed-attempt count. Used as the element key so submitting the
   * same bad input twice remounts the node: the text would be identical, and an
   * unchanged live region is not re-announced by screen readers.
   *
   * The key lives inside this component rather than being the caller's job, so
   * a caller cannot forget it and quietly lose the announcement.
   */
  attempt?: number
}

/**
 * The form's error region. Always rendered, even when empty — a live region
 * inserted at the same moment as its message is often missed by screen readers.
 * `role="alert"` already implies assertive, so no `aria-live` is set alongside.
 */
export function FormAlert({ id, message, attempt }: FormAlertProps) {
  return (
    <p key={attempt ?? 0} id={id} role="alert" className="min-h-5 text-sm text-red-600">
      {message ?? ''}
    </p>
  )
}
