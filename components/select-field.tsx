/**
 * A labelled dropdown, built for the five near-identical selectors on the New
 * Interview page. Same extraction threshold `text-field.tsx` used: five callers
 * that already share a DOM shape, not a speculative design system.
 *
 * Two deliberate differences from `TextField`:
 *
 * 1. It is CONTROLLED (`value` + `onChange`) rather than `defaultValue`. The
 *    page owns the whole intake object, because Stories 2.2/2.3 add more fields
 *    to it and Story 3.1 submits it as one payload.
 *
 * 2. It renders its OWN error message instead of pointing at a shared alert.
 *    Five fields can each be wrong at once, so "which field?" has to live next
 *    to the field. The message is plain text, not `role="alert"` — five live
 *    regions announcing at the same moment is noise. The page's single
 *    `FormAlert` is the live region; these are the details it summarises.
 */
type SelectFieldProps = {
  id: string
  name: string
  label: string
  value: string
  onChange: (value: string) => void
  options: readonly string[]
  /** Shown as the initial, unselectable option. Its value is always `''`. */
  placeholder: string
  /** Turns an option value into its display text. Defaults to the value. */
  formatLabel?: (value: string) => string
  error?: string
}

export function SelectField({
  id,
  name,
  label,
  value,
  onChange,
  options,
  placeholder,
  formatLabel,
  error,
}: SelectFieldProps) {
  const errorId = `${id}-error`

  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      {/* No `required` attribute on purpose. Native validation blocks submit
          BEFORE React's onSubmit runs, so the message below would never render
          and the browser's own bubble would take its place — the form would
          look fine while its validation code never executed. The page owns
          validation instead, and sets `noValidate` on the form to say so. */}
      <select
        id={id}
        name={name}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-required="true"
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        className="w-full rounded border border-gray-300 bg-white px-3 py-2"
      >
        {/* `disabled` keeps it unpickable once a real choice is made, while
            still being what the field shows before the user touches it. */}
        <option value="" disabled>
          {placeholder}
        </option>
        {options.map((option) => (
          <option key={option} value={option}>
            {formatLabel ? formatLabel(option) : option}
          </option>
        ))}
      </select>
      {error ? (
        <p id={errorId} className="text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  )
}
