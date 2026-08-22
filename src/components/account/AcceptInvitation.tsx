import { useState } from 'react'
import { Link } from 'react-router-dom'
import { getApiErrorMessage } from '../../api/errors'
import { acceptInvitation, type AcceptedInvitation } from '../../api/invitations'
import { roleLabel } from '../../lib/permissions'
import { useRestoreSession } from '../../hooks/useRestoreSession'
import { useOrganisationStore } from '../../store/useOrganisationStore'
import './AcceptInvitation.css'

interface AcceptInvitationProps {
  /** The `token` query parameter from the invitation email link. */
  token: string | null
}

/**
 * Accepts an organisation invitation from its emailed link.
 *
 * Acceptance is an explicit click rather than something that fires on arrival:
 * following a link should not silently join somebody to an organisation, and the
 * page has to establish who is signed in before the server can match the
 * invitation to their verified address anyway.
 */
function AcceptInvitation({ token }: AcceptInvitationProps) {
  const session = useRestoreSession()
  const [accepted, setAccepted] = useState<AcceptedInvitation | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (!token) {
    return (
      <p className="account-error" role="alert">
        This link is missing its invitation token. Open the link from your invitation email again.
      </p>
    )
  }

  if (session.status === 'unknown' || session.status === 'restoring') {
    return (
      <p className="account-notice" role="status">
        Checking your session…
      </p>
    )
  }

  if (session.status === 'error') {
    return (
      <p className="account-error" role="alert">
        {session.error}
      </p>
    )
  }

  if (session.status !== 'authenticated' || !session.user) {
    return (
      <div className="accept-invitation">
        <p className="account-notice" role="status">
          Sign in with the address this invitation was sent to, then return to this link to accept
          it.
        </p>
        <Link className="mono accept-invitation-link" to="/account">
          GO TO SIGN IN →
        </Link>
      </div>
    )
  }

  if (accepted) {
    return (
      <div className="accept-invitation">
        <p className="account-confirmation" role="status">
          You have joined this organisation as <strong>{roleLabel(accepted.role)}</strong>.
        </p>
        <Link className="mono accept-invitation-link" to="/account">
          OPEN YOUR ORGANISATIONS →
        </Link>
      </div>
    )
  }

  const handleAccept = async (): Promise<void> => {
    setSubmitting(true)
    setError(null)
    try {
      const result = await acceptInvitation(token)
      setAccepted(result)
      // The membership is new, so any list already loaded is out of date.
      await useOrganisationStore.getState().load()
    } catch (caught) {
      setError(
        getApiErrorMessage(caught, 'The invitation could not be accepted.'),
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="accept-invitation">
      <p className="accept-invitation-identity">
        Signed in as <strong>{session.user.email}</strong>. An invitation can only be accepted by
        the address it was sent to.
      </p>

      {!session.user.emailVerified && (
        <p className="account-unverified">
          Verify your email address first — check your inbox for the verification code.
        </p>
      )}

      {error !== null && (
        <p className="account-error" role="alert">
          {error}
        </p>
      )}

      <button
        className="mono account-submit"
        type="button"
        onClick={() => void handleAccept()}
        disabled={submitting}
        aria-busy={submitting}
      >
        {submitting ? 'ACCEPT INVITATION…' : 'ACCEPT INVITATION'}
      </button>
    </div>
  )
}

export default AcceptInvitation
