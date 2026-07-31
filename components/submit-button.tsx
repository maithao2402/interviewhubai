type SubmitButtonProps = {
  pending: boolean
  label: string
  pendingLabel: string
}

/**
 * Full-width submit button with a pending label.
 *
 * Note it is not disabled here: both forms wrap their controls in a
 * `<fieldset disabled={pending}>`, which switches off every control at once.
 * Disabling only the button would still let Enter inside a text input fire a
 * second submit.
 */
export function SubmitButton({ pending, label, pendingLabel }: SubmitButtonProps) {
  return (
    <button
      type="submit"
      className="w-full rounded bg-black px-3 py-2 text-white disabled:opacity-50"
    >
      {pending ? pendingLabel : label}
    </button>
  )
}
