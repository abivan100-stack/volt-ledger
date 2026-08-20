import { useState, type FormEvent } from 'react'
import { ApiError } from '../../api/errors'
import { useSessionStore } from '../../store/useSessionStore'
import './SignInForm.css'

/**
 * A refused sign-in has two very different causes the visitor can act on: a
 * wrong credential, and an address that has not been verified yet. The server
 * distinguishes them by status, so the form does too rather than showing one
 * unhelpful failure for both.
 */
function messageFor(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403) {
      return 'This address has not been verified yet. Check your inbox for the verification link — we have sent a fresh one.'
    }
    return error.message
  }
  return 'Sign in could not be completed.'
}

function SignInForm() {
  const signIn = useSessionStore((state) => state.signIn)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (!email || !password || submitting) return

    setSubmitting(true)
    setError(null)
    try {
      await signIn({ email, password })
    } catch (caught) {
      setError(messageFor(caught))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="account-form" onSubmit={handleSubmit} noValidate>
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

      <label className="account-field">
        <span className="mono account-field-label">PASSWORD</span>
        <input
          className="account-input"
          type="password"
          name="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>

      {error !== null && (
        <p className="account-error" role="alert">
          {error}
        </p>
      )}

      {/* The pending label keeps the "SIGN IN" prefix so the accessible name still
          contains the control's visible label (WCAG label-in-name). */}
      <button className="mono account-submit" type="submit" disabled={submitting} aria-busy={submitting}>
        {submitting ? 'SIGN IN…' : 'SIGN IN'}
      </button>
    </form>
  )
}

export default SignInForm
