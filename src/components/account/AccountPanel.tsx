import { useState } from 'react'
import { isApiConfigured } from '../../api/config'
import { useRestoreSession } from '../../hooks/useRestoreSession'
import { useSessionStore } from '../../store/useSessionStore'
import ChangeEmailForm from './ChangeEmailForm'
import CloseAccount from './CloseAccount'
import SignInForm from './SignInForm'
import SignUpForm from './SignUpForm'
import './AccountPanel.css'

type AuthTab = 'sign-in' | 'sign-up'

/**
 * The account surface: whichever of "no backend", "checking", "signed out",
 * "signed in", or "could not tell" currently applies.
 *
 * The unconfigured case comes first and short-circuits the rest — a build with
 * no `VITE_API_BASE_URL` is the browser-only demo, where offering a sign-in form
 * would promise something that cannot work.
 */
function AccountPanel() {
  const configured = isApiConfigured()
  if (!configured) return <DemoModeNotice />
  return <SessionAwarePanel />
}

function DemoModeNotice() {
  return (
    <p className="account-notice" role="status">
      This build runs in demo mode with no backend, so accounts and organisations are unavailable.
      The neighbourhood simulation and ledger below work exactly as they do everywhere else.
    </p>
  )
}

function SessionAwarePanel() {
  const session = useRestoreSession()
  const [tab, setTab] = useState<AuthTab>('sign-in')

  if (session.status === 'unknown' || session.status === 'restoring') {
    return (
      <p className="account-notice" role="status">
        Checking your session…
      </p>
    )
  }

  if (session.status === 'error') {
    return (
      <div className="account-state">
        <p className="account-error" role="alert">
          {session.error}
        </p>
        <button
          className="mono account-submit"
          type="button"
          onClick={() => void useSessionStore.getState().restore()}
        >
          RETRY
        </button>
      </div>
    )
  }

  if (session.status === 'authenticated' && session.user) {
    return <SignedIn />
  }

  return (
    <div className="account-state">
      {session.expired && (
        <div className="account-expiry" role="alert">
          <p className="account-expiry-text">Your session expired. Sign in again to continue.</p>
          <button
            className="mono account-expiry-dismiss"
            type="button"
            onClick={() => useSessionStore.getState().dismissExpiryNotice()}
          >
            DISMISS
          </button>
        </div>
      )}

      <div className="account-tabs" role="tablist" aria-label="Account access">
        <button
          className="mono account-tab"
          type="button"
          role="tab"
          aria-selected={tab === 'sign-in'}
          onClick={() => setTab('sign-in')}
        >
          SIGN IN
        </button>
        <button
          className="mono account-tab"
          type="button"
          role="tab"
          aria-selected={tab === 'sign-up'}
          onClick={() => setTab('sign-up')}
        >
          CREATE ACCOUNT
        </button>
      </div>

      {tab === 'sign-in' ? <SignInForm /> : <SignUpForm />}
    </div>
  )
}

function SignedIn() {
  const user = useSessionStore((state) => state.user)
  const signOut = useSessionStore((state) => state.signOut)
  const refresh = useSessionStore((state) => state.restore)
  const expire = useSessionStore((state) => state.expire)
  const [signingOut, setSigningOut] = useState(false)

  if (!user) return null

  const handleSignOut = async (): Promise<void> => {
    setSigningOut(true)
    try {
      await signOut()
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <div className="account-state">
      <p className="mono account-kicker">SIGNED IN</p>
      <p className="account-identity">
        <strong>{user.name}</strong>
        <span className="account-email">{user.email}</span>
      </p>
      {!user.emailVerified && (
        <p className="account-unverified">
          Unverified address — check your inbox to finish verifying it.
        </p>
      )}
      <button
        className="mono account-submit"
        type="button"
        onClick={() => void handleSignOut()}
        disabled={signingOut}
        aria-busy={signingOut}
      >
        {signingOut ? 'SIGN OUT…' : 'SIGN OUT'}
      </button>

      <ChangeEmailForm currentEmail={user.email} onChanged={() => void refresh()} />

      {/* Closing ends the session, so the store is told rather than left holding
          a user who no longer exists. */}
      <CloseAccount onClosed={() => expire()} />
    </div>
  )
}

export default AccountPanel
