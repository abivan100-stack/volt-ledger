import { useState, type FormEvent } from 'react'
import { changeEmail, requestEmailChallenge, requestEmailChange } from '../../api/auth'
import { ApiError } from '../../api/errors'
import VerificationCodeField from './VerificationCodeField'
import './ChangeEmailForm.css'

/**
 * Changing the address on an account.
 *
 * Both mailboxes are proved, in that order: the current one, so a stolen session
 * cannot move an account somewhere its holder cannot reach, and the new one, so
 * it is real. The server only checks that a session exists, never that it is
 * fresh, which is why the current-mailbox step is not skippable.
 *
 * The three steps are one component because they are one decision — abandoning
 * halfway leaves the address unchanged, and there is nothing to resume.
 */

/** Mirrors VERIFICATION_CODE_LENGTH on the API. */
const CODE_LENGTH = 6

type Step = 'idle' | 'current' | 'new' | 'done'

function messageFor(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.status === 400) return 'That code is not right, or it has expired.'
    return error.message
  }
  return fallback
}

interface ChangeEmailFormProps {
  currentEmail: string
  /** Called once the address has changed, so the session can be re-read. */
  onChanged?: () => void
}

function ChangeEmailForm({ currentEmail, onChanged }: ChangeEmailFormProps) {
  const [step, setStep] = useState<Step>('idle')
  const [newEmail, setNewEmail] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = (): void => {
    setStep('idle')
    setNewEmail('')
    setCode('')
    setError(null)
  }

  const startChange = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await requestEmailChallenge()
      setStep('current')
    } catch (caught) {
      setError(messageFor(caught, 'The code could not be sent.'))
    } finally {
      setBusy(false)
    }
  }

  const submitCurrent = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (busy || code.length < CODE_LENGTH || newEmail.trim() === '') return

    setBusy(true)
    setError(null)
    try {
      await requestEmailChange({ newEmail: newEmail.trim(), otp: code })
      setCode('')
      setStep('new')
    } catch (caught) {
      setError(messageFor(caught, 'The change could not be started.'))
      setCode('')
    } finally {
      setBusy(false)
    }
  }

  const submitNew = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (busy || code.length < CODE_LENGTH) return

    setBusy(true)
    setError(null)
    try {
      await changeEmail({ newEmail: newEmail.trim(), otp: code })
      setStep('done')
      onChanged?.()
    } catch (caught) {
      setError(messageFor(caught, 'The address could not be changed.'))
      setCode('')
    } finally {
      setBusy(false)
    }
  }

  if (step === 'done') {
    return (
      <div className="change-email" role="status">
        <p className="account-confirmation-note">
          Your address is now <strong>{newEmail.trim()}</strong>.
        </p>
      </div>
    )
  }

  if (step === 'idle') {
    return (
      <div className="change-email">
        <button
          className="mono account-secondary-action"
          type="button"
          onClick={() => void startChange()}
          disabled={busy}
          aria-busy={busy}
        >
          {busy ? 'SENDING…' : 'CHANGE EMAIL'}
        </button>
        {error !== null && (
          <p className="account-error" role="alert">
            {error}
          </p>
        )}
      </div>
    )
  }

  if (step === 'current') {
    return (
      <form className="change-email account-form" onSubmit={submitCurrent} noValidate>
        <p className="account-confirmation-note" role="status">
          We requested a code for <strong>{currentEmail}</strong>. If it does not arrive shortly, start again, then enter it along with the address you want
          to move to.
        </p>

        <label className="account-field">
          <span className="mono account-field-label">NEW EMAIL</span>
          <input
            className="account-input"
            type="email"
            name="newEmail"
            autoComplete="email"
            required
            maxLength={254}
            value={newEmail}
            onChange={(event) => setNewEmail(event.target.value)}
          />
        </label>

        <VerificationCodeField
          id="change-email-current-code"
          label="CODE FROM CURRENT ADDRESS"
          length={CODE_LENGTH}
          value={code}
          onChange={setCode}
          disabled={busy}
        />

        {error !== null && (
          <p className="account-error" role="alert">
            {error}
          </p>
        )}

        <button
          className="mono account-submit"
          type="submit"
          disabled={busy || code.length < CODE_LENGTH || newEmail.trim() === ''}
          aria-busy={busy}
        >
          {busy ? 'CONTINUE…' : 'CONTINUE'}
        </button>
        <button className="mono account-secondary-action" type="button" onClick={reset}>
          CANCEL
        </button>
      </form>
    )
  }

  return (
    <form className="change-email account-form" onSubmit={submitNew} noValidate>
      <p className="account-confirmation-note" role="status">
        We sent a second code to <strong>{newEmail.trim()}</strong>. Enter it to finish.
      </p>

      <VerificationCodeField
        id="change-email-new-code"
        label="CODE FROM NEW ADDRESS"
        length={CODE_LENGTH}
        value={code}
        onChange={setCode}
        disabled={busy}
      />

      {error !== null && (
        <p className="account-error" role="alert">
          {error}
        </p>
      )}

      <button
        className="mono account-submit"
        type="submit"
        disabled={busy || code.length < CODE_LENGTH}
        aria-busy={busy}
      >
        {busy ? 'CHANGE EMAIL…' : 'CHANGE EMAIL'}
      </button>
      <button className="mono account-secondary-action" type="button" onClick={reset}>
        CANCEL
      </button>
    </form>
  )
}

export default ChangeEmailForm
