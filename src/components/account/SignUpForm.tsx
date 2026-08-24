import { useState, type FormEvent } from 'react'
import { resendVerificationEmail, signUpWithEmail, verifyEmailOtp } from '../../api/auth'
import { ApiError, getApiErrorMessage } from '../../api/errors'
import PasswordField from './PasswordField'
import VerificationCodeField from './VerificationCodeField'
import './SignUpForm.css'

/** Matches the API's Better Auth configuration; checked here to save a round trip. */
const MINIMUM_PASSWORD_LENGTH = 12

/** Mirrors VERIFICATION_CODE_LENGTH on the API. */
const VERIFICATION_CODE_LENGTH = 6

/** Mirrors VERIFICATION_CODE_TTL_SECONDS on the API, in minutes. */
const VERIFICATION_CODE_TTL_MINUTES = 10

function SignUpForm() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null)
  const [resending, setResending] = useState(false)
  const [resendMessage, setResendMessage] = useState<string | null>(null)
  const [resendError, setResendError] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [verifyError, setVerifyError] = useState<string | null>(null)
  const [verified, setVerified] = useState(false)

  const handleVerify = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (registeredEmail === null || verifying || code.length < VERIFICATION_CODE_LENGTH) return

    setVerifying(true)
    setVerifyError(null)
    setResendMessage(null)
    try {
      await verifyEmailOtp({ email: registeredEmail, otp: code })
      setVerified(true)
    } catch (caught) {
      // The server answers a wrong code and an expired one identically, so the
      // message covers both rather than guessing which happened.
      setVerifyError(
        caught instanceof ApiError && caught.status === 400
          ? 'That code is not right, or it has expired. Send a new one and try again.'
          : 'The code could not be checked.',
      )
      setCode('')
    } finally {
      setVerifying(false)
    }
  }

  const handleResend = async (): Promise<void> => {
    if (registeredEmail === null || resending) return

    setResending(true)
    setResendMessage(null)
    setResendError(null)
    try {
      await resendVerificationEmail({ email: registeredEmail })
      setCode('')
      setVerifyError(null)
      setResendMessage('A new code was requested. If it does not arrive shortly, try again.')
    } catch (caught) {
      setResendError(caught instanceof ApiError ? caught.message : 'The code could not be sent.')
    } finally {
      setResending(false)
    }
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (!name || !email || !password || submitting) return

    if (password.length < MINIMUM_PASSWORD_LENGTH) {
      setError(`Choose a password of at least ${MINIMUM_PASSWORD_LENGTH} characters.`)
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      await signUpWithEmail({ name, email, password })
      // Verification is required, so there is no session yet. Say what actually
      // happened instead of implying the visitor is signed in.
      setRegisteredEmail(email)
    } catch (caught) {
      setError(getApiErrorMessage(caught, 'The account could not be created.'))
    } finally {
      setSubmitting(false)
    }
  }

  if (verified) {
    return (
      <div className="account-confirmation" role="status">
        <p>
          <strong>{registeredEmail}</strong> is verified. You can sign in now.
        </p>
      </div>
    )
  }

  if (registeredEmail !== null) {
    return (
      <form className="account-form" onSubmit={handleVerify} noValidate>
        <p className="account-confirmation-note" role="status">
          We requested a {VERIFICATION_CODE_LENGTH}-digit code for <strong>{registeredEmail}</strong>. If it does
          not arrive shortly, use “Send a new code”.
        </p>

        <VerificationCodeField
          id="sign-up-code"
          label="VERIFICATION CODE"
          length={VERIFICATION_CODE_LENGTH}
          value={code}
          onChange={(next) => {
            setCode(next)
            setVerifyError(null)
          }}
          disabled={verifying}
          hint={`It expires in ${VERIFICATION_CODE_TTL_MINUTES} minutes.`}
        />

        {verifyError !== null && (
          <p className="account-error" role="alert">
            {verifyError}
          </p>
        )}
        {resendMessage !== null && <p className="account-confirmation-note">{resendMessage}</p>}
        {resendError !== null && (
          <p className="account-error" role="alert">
            {resendError}
          </p>
        )}

        {/* Kept disabled until the code is the right length: submitting a short
            code can only spend one of a small number of allowed attempts. */}
        <button
          className="mono account-submit"
          type="submit"
          disabled={verifying || code.length < VERIFICATION_CODE_LENGTH}
          aria-busy={verifying}
        >
          {verifying ? 'VERIFY…' : 'VERIFY'}
        </button>

        <button
          className="mono account-secondary-action"
          type="button"
          onClick={() => void handleResend()}
          disabled={resending}
          aria-busy={resending}
        >
          {resending ? 'SENDING…' : 'SEND A NEW CODE'}
        </button>
        <button
          className="mono account-secondary-action"
          type="button"
          onClick={() => {
            setRegisteredEmail(null)
            setCode('')
            setVerifyError(null)
            setResendMessage(null)
            setResendError(null)
          }}
        >
          USE A DIFFERENT ADDRESS
        </button>
      </form>
    )
  }

  return (
    <form className="account-form" onSubmit={handleSubmit} noValidate>
      <label className="account-field">
        <span className="mono account-field-label">NAME</span>
        <input
          className="account-input"
          type="text"
          name="name"
          autoComplete="name"
          required
          maxLength={100}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>

      <label className="account-field">
        <span className="mono account-field-label">EMAIL</span>
        <input
          className="account-input"
          type="email"
          name="email"
          autoComplete="email"
          required
          maxLength={254}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>

      <PasswordField
        id="sign-up-password"
        label="PASSWORD"
        name="password"
        autoComplete="new-password"
        value={password}
        onChange={setPassword}
        hint={`At least ${MINIMUM_PASSWORD_LENGTH} characters.`}
      />

      {error !== null && (
        <p className="account-error" role="alert">
          {error}
        </p>
      )}

      <button className="mono account-submit" type="submit" disabled={submitting} aria-busy={submitting}>
        {submitting ? 'CREATE ACCOUNT…' : 'CREATE ACCOUNT'}
      </button>
    </form>
  )
}

export default SignUpForm
