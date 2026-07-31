/**
 * A labelled text input, extracted from the register and login forms once both
 * existed and shared the same DOM shape (label + input + error wiring).
 * Deliberately narrow: prop values still differ per caller (e.g. register's
 * password field sets `minLength`/`maxLength`, login's does not), but the
 * markup and accessibility wiring are identical. Widen it when a third caller
 * actually needs a different shape, not just different prop values.
 */
type TextFieldProps = {
  id: string
  name: string
  label: string
  type: 'email' | 'password'
  autoComplete: string
  defaultValue?: string
  minLength?: number
  maxLength?: number
  /** Marks the field invalid and links it to the form's alert region. */
  invalid?: boolean
  describedBy?: string
}

export function TextField({
  id,
  name,
  label,
  type,
  autoComplete,
  defaultValue,
  minLength,
  maxLength,
  invalid,
  describedBy,
}: TextFieldProps) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
        required
        defaultValue={defaultValue}
        minLength={minLength}
        maxLength={maxLength}
        aria-invalid={invalid}
        aria-describedby={invalid ? describedBy : undefined}
        className="w-full rounded border border-gray-300 px-3 py-2"
      />
    </div>
  )
}
