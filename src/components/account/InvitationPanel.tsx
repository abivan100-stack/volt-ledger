import { useEffect, useState, type FormEvent } from 'react'
import { ApiError } from '../../api/errors'
import type { Invitation } from '../../api/invitations'
import {
  ASSIGNABLE_ROLES,
  canManageMembers,
  canManageMembership,
  roleLabel,
  type AssignableRole,
  type MembershipRole,
} from '../../lib/permissions'
import { useInvitationStore } from '../../store/useInvitationStore'
import { useOrganisationStore } from '../../store/useOrganisationStore'
import './InvitationPanel.css'

/**
 * Pending and historic invitations for the selected organisation.
 *
 * Only owners and admins may read this route at all, so the panel renders
 * nothing for operators and viewers rather than showing them a permission error
 * for something they never asked to see.
 */
function InvitationPanel() {
  const organisation = useOrganisationStore((state) => state.selected())
  if (!organisation || !canManageMembers(organisation.role)) return null
  return <ManageableInvitations organisationId={organisation.id} actorRole={organisation.role} />
}

interface ManageableInvitationsProps {
  organisationId: string
  actorRole: MembershipRole
}

function messageFor(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message
  return fallback
}

function ManageableInvitations({ organisationId, actorRole }: ManageableInvitationsProps) {
  const { status, invitations, error } = useInvitationStore()

  useEffect(() => {
    if (useInvitationStore.getState().organisationId === organisationId) return
    void useInvitationStore.getState().load(organisationId)
  }, [organisationId])

  return (
    <section className="invitation-panel">
      <h3 className="invitation-panel-heading">Invitations</h3>

      <InviteForm actorRole={actorRole} />

      {(status === 'unknown' || status === 'loading') && (
        <p className="account-notice" role="status">
          Loading invitations…
        </p>
      )}

      {status === 'error' && (
        <>
          <p className="account-error" role="alert">
            {error}
          </p>
          <button
            className="mono account-submit"
            type="button"
            onClick={() => void useInvitationStore.getState().load(organisationId)}
          >
            RETRY
          </button>
        </>
      )}

      {status === 'ready' &&
        (invitations.length === 0 ? (
          <p className="invitation-empty">No invitations have been issued yet.</p>
        ) : (
          <ul className="invitation-items">
            {invitations.map((invitation) => (
              <InvitationRow key={invitation.id} invitation={invitation} actorRole={actorRole} />
            ))}
          </ul>
        ))}
    </section>
  )
}

function InviteForm({ actorRole }: { actorRole: MembershipRole }) {
  // An admin may not grant the admin role, which the server enforces too.
  const grantableRoles = ASSIGNABLE_ROLES.filter((role) =>
    canManageMembership(actorRole, 'viewer', role),
  )
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<AssignableRole>(grantableRoles[0] ?? 'viewer')
  const [error, setError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (!email.trim() || submitting) return

    setSubmitting(true)
    setError(null)
    setSentTo(null)
    try {
      const created = await useInvitationStore.getState().invite({ email: email.trim(), role })
      // The server only reports success once the email has actually been sent.
      setSentTo(created.email)
      setEmail('')
    } catch (caught) {
      setError(messageFor(caught, 'The invitation could not be sent.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="account-form invitation-form" onSubmit={handleSubmit} noValidate>
      <label className="account-field">
        <span className="mono account-field-label">INVITE BY EMAIL</span>
        <input
          className="account-input"
          type="email"
          name="invitationEmail"
          autoComplete="off"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>

      <label className="account-field">
        <span className="mono account-field-label">ROLE</span>
        <select
          className="account-input"
          value={role}
          onChange={(event) => setRole(event.target.value as AssignableRole)}
        >
          {grantableRoles.map((grantable) => (
            <option key={grantable} value={grantable}>
              {roleLabel(grantable)}
            </option>
          ))}
        </select>
        <span className="account-field-hint">
          Ownership cannot be invited; it moves through an ownership transfer.
        </span>
      </label>

      {error !== null && (
        <p className="account-error" role="alert">
          {error}
        </p>
      )}

      {sentTo !== null && (
        <p className="account-confirmation" role="status">
          Invitation queued for <strong>{sentTo}</strong>. It becomes a membership once they accept it
          while signed in with that verified address.
        </p>
      )}

      <button className="mono account-submit" type="submit" disabled={submitting} aria-busy={submitting}>
        {submitting ? 'SEND INVITATION…' : 'SEND INVITATION'}
      </button>
    </form>
  )
}

function InvitationRow({
  invitation,
  actorRole,
}: {
  invitation: Invitation
  actorRole: MembershipRole
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // An admin cannot revoke an admin invitation, matching the create rule.
  const revocable =
    invitation.status === 'pending' && canManageMembership(actorRole, 'viewer', invitation.role)

  const handleRevoke = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await useInvitationStore.getState().revoke(invitation.id)
    } catch (caught) {
      setError(messageFor(caught, 'The invitation could not be revoked.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="invitation-row">
      <div className="invitation-row-identity">
        <span className="invitation-row-email">{invitation.email}</span>
        <span className="mono invitation-row-role">{roleLabel(invitation.role)}</span>
      </div>

      <div className="invitation-row-controls">
        <span className={`mono invitation-status invitation-status-${invitation.status}`}>
          {invitation.status.toUpperCase()}
        </span>
        {revocable && (
          <button
            className="mono invitation-revoke"
            type="button"
            disabled={busy}
            onClick={() => void handleRevoke()}
          >
            REVOKE
          </button>
        )}
      </div>

      {error !== null && (
        <p className="account-error invitation-row-error" role="alert">
          {error}
        </p>
      )}
    </li>
  )
}

export default InvitationPanel
