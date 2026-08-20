import { useState, type FormEvent } from 'react'
import { signUpWithEmail } from '../../api/auth'
import { ApiError } from '../../api/errors'
import PasswordField from './PasswordField'
import './SignUpForm.css'

/** Matches the API's Better Auth configuration; checked here to save a round trip. */
const MINIMUM_PASSWORD_LENGTH = 12

function messageFor(error: unknown): string {
  if (error instanceof ApiError) return error.message
  return 'The account could not be created.'
}

function SignUpForm() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null)

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
      setError(messageFor(caught))
    } finally {
      setSubmitting(false)
    }
  }

  if (registeredEmail !== null) {
    return (
      <p className="account-confirmation" role="status">
        Check <strong>{registeredEmail}</strong> for a verification link. You can sign in once the
        address is verified.
      </p>
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
