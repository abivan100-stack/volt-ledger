import './VerificationCodeField.css'

/**
 * The verification code input.
 *
 * One input, not six boxes. Six separate boxes look tidier and behave worse:
 * they fragment the accessible name so a screen reader announces six unlabelled
 * fields, they fight paste, and they make backspace ambiguous. A single field
 * with `autocomplete="one-time-code"` is what lets iOS and Android offer the
 * code straight from the notification, which is the fastest path there is.
 *
 * Non-digits are stripped as they arrive rather than rejected on submit, so a
 * pasted code carrying a stray space still lands correctly.
 */

export interface VerificationCodeFieldProps {
  id: string
  label: string
  length: number
  value: string
  onChange: (value: string) => void
  hint?: string
  disabled?: boolean
}

function VerificationCodeField({
  id,
  label,
  length,
  value,
  onChange,
  hint,
  disabled,
}: VerificationCodeFieldProps) {
  const hintId = hint === undefined ? undefined : `${id}-hint`

  return (
    <div className="account-field">
      <label className="mono account-field-label" htmlFor={id}>
        {label}
      </label>

      <input
        id={id}
        className="account-input verification-code-input"
        type="text"
        name="otp"
        // Tells iOS/Android to offer the code from the arriving message.
        autoComplete="one-time-code"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={length}
        autoFocus
        required
        disabled={disabled === true}
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/\D/g, '').slice(0, length))}
        {...(hintId ? { 'aria-describedby': hintId } : {})}
      />

      {hint !== undefined && (
        <span className="account-field-hint" id={hintId}>
          {hint}
        </span>
      )}
    </div>
  )
}

export default VerificationCodeField
