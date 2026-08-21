import { useState } from 'react'
import './PasswordField.css'

/**
 * A password input with a reveal control.
 *
 * Typing a long password blind is where sign-in attempts go wrong, so the person
 * entering one can look at it. The control is a real button rather than a click
 * handler on an icon, which is what makes it reachable by keyboard, and its name
 * describes what pressing it will do next — a toggle still called "Show
 * password" while the password is on screen tells a screen reader the opposite
 * of the truth.
 *
 * Revealing is never remembered between mounts: it is a deliberate act taken in
 * the moment, not a preference.
 */

export interface PasswordFieldProps {
  id: string
  label: string
  name: string
  autoComplete: 'current-password' | 'new-password'
  value: string
  onChange: (value: string) => void
  hint?: string
}

function PasswordField({ id, label, name, autoComplete, value, onChange, hint }: PasswordFieldProps) {
  const [revealed, setRevealed] = useState(false)
  const hintId = hint === undefined ? undefined : `${id}-hint`

  return (
    <div className="account-field">
      <label className="mono account-field-label" htmlFor={id}>
        {label}
      </label>

      <div className="password-field-control">
        <input
          id={id}
          className="account-input password-field-input"
          type={revealed ? 'text' : 'password'}
          name={name}
          autoComplete={autoComplete}
          required
          value={value}
          onChange={(event) => onChange(event.target.value)}
          {...(hintId ? { 'aria-describedby': hintId } : {})}
        />

        {/* type="button" matters: the default inside a form is submit, and a
            reveal that also submits would send a half-typed credential. */}
        <button
          type="button"
          className="mono password-field-toggle"
          onClick={() => setRevealed((current) => !current)}
          aria-label={revealed ? 'Hide password' : 'Show password'}
          aria-controls={id}
        >
          {revealed ? 'HIDE' : 'SHOW'}
        </button>
      </div>

      {hint !== undefined && (
        <span className="account-field-hint" id={hintId}>
          {hint}
        </span>
      )}
    </div>
  )
}

export default PasswordField
