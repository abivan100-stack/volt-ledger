import { useEffect, useState } from 'react'
import { getApiErrorMessage } from '../../api/errors'
import type { Membership } from '../../api/memberships'
import {
  ASSIGNABLE_ROLES,
  canManageMembers,
  canManageMembership,
  canTransferOwnership,
  roleLabel,
  type AssignableRole,
  type MembershipRole,
} from '../../lib/permissions'
import { useMembershipStore } from '../../store/useMembershipStore'
import { useOrganisationStore } from '../../store/useOrganisationStore'
import { useSessionStore } from '../../store/useSessionStore'
import './MemberList.css'

/**
 * Members of the selected organisation, with the management controls the
 * caller's role actually permits.
 *
 * Every rule applied here is enforced again on the API — hiding a control is a
 * courtesy to the user, not the security boundary.
 */
function MemberList() {
  const organisation = useOrganisationStore((state) => state.selected())
  const { status, members, error } = useMembershipStore()
  const currentUserId = useSessionStore((session) => session.user?.id ?? null)
  const [actionError, setActionError] = useState<string | null>(null)

  const organisationId = organisation?.id ?? null

  useEffect(() => {
    if (!organisationId) return
    if (useMembershipStore.getState().organisationId === organisationId) return
    void useMembershipStore.getState().load(organisationId)
  }, [organisationId])

  if (!organisation) return null

  if (status === 'unknown' || status === 'loading') {
    return (
      <section className="member-list">
        <h3 className="member-list-heading">Members</h3>
        <p className="account-notice" role="status">
          Loading members…
        </p>
      </section>
    )
  }

  if (status === 'error') {
    return (
      <section className="member-list">
        <h3 className="member-list-heading">Members</h3>
        <p className="account-error" role="alert">
          {error}
        </p>
        <button
          className="mono account-submit"
          type="button"
          onClick={() => void useMembershipStore.getState().load(organisation.id)}
        >
          RETRY
        </button>
      </section>
    )
  }

  return (
    <section className="member-list">
      <h3 className="member-list-heading">Members</h3>

      {actionError !== null && (
        <p className="account-error" role="alert">
          {actionError}
        </p>
      )}

      <ul className="member-list-items">
        {members.map((member) => (
          <MemberRow
            key={member.id}
            member={member}
            actorRole={organisation.role}
            isSelf={member.userId === currentUserId}
            onError={setActionError}
          />
        ))}
      </ul>

      {!canManageMembers(organisation.role) && (
        <p className="member-list-readonly">Your role can view members but not change them.</p>
      )}
    </section>
  )
}

interface MemberRowProps {
  member: Membership
  actorRole: MembershipRole
  isSelf: boolean
  onError: (message: string | null) => void
}

function MemberRow({ member, actorRole, isSelf, onError }: MemberRowProps) {
  const [busy, setBusy] = useState(false)
  const [confirmingTransfer, setConfirmingTransfer] = useState(false)

  // A membership may carry no email. Name the row by something readable rather
  // than rendering "null" or labelling a control "Role for null".
  const label = member.email ?? `No email recorded (${member.userId})`

  // A member cannot edit or remove their own membership through this list.
  const editable = canManageMembership(actorRole, member.role) && !isSelf
  const promotable = canTransferOwnership(actorRole) && member.role !== 'owner' && !isSelf

  const run = async (action: () => Promise<unknown>, fallback: string): Promise<void> => {
    setBusy(true)
    onError(null)
    try {
      await action()
    } catch (caught) {
      onError(getApiErrorMessage(caught, fallback))
    } finally {
      setBusy(false)
    }
  }

  const handleRoleChange = (role: AssignableRole): void => {
    void run(
      () => useMembershipStore.getState().changeRole(member.userId, role),
      'The role could not be changed.',
    )
  }

  const handleRemove = (): void => {
    void run(
      () => useMembershipStore.getState().remove(member.userId),
      'The member could not be removed.',
    )
  }

  const handleTransfer = (): void => {
    setConfirmingTransfer(false)
    void run(
      () => useMembershipStore.getState().handOverOwnership(member.userId),
      'Ownership could not be transferred.',
    )
  }

  return (
    <li className="member-row">
      <div className="member-row-identity">
        <span className="member-row-email">{label}</span>
        {isSelf && <span className="mono member-row-self">YOU</span>}
      </div>

      <div className="member-row-controls">
        {editable ? (
          <select
            className="account-input member-row-role"
            aria-label={`Role for ${label}`}
            value={member.role}
            disabled={busy}
            onChange={(event) => handleRoleChange(event.target.value as AssignableRole)}
          >
            {ASSIGNABLE_ROLES.filter((role) =>
              canManageMembership(actorRole, member.role, role),
            ).map((role) => (
              <option key={role} value={role}>
                {roleLabel(role)}
              </option>
            ))}
          </select>
        ) : (
          <span className="mono member-row-role-static">{roleLabel(member.role)}</span>
        )}

        {promotable &&
          (confirmingTransfer ? (
            <>
              {/* Transferring ownership demotes the acting owner to admin in the
                  same transaction, so it is confirmed rather than one-click. */}
              <button
                className="mono member-row-action member-row-confirm"
                type="button"
                disabled={busy}
                onClick={handleTransfer}
              >
                {`CONFIRM: HAND OVER TO ${label}`}
              </button>
              <button
                className="mono member-row-action"
                type="button"
                onClick={() => setConfirmingTransfer(false)}
              >
                CANCEL
              </button>
            </>
          ) : (
            <button
              className="mono member-row-action"
              type="button"
              disabled={busy}
              onClick={() => setConfirmingTransfer(true)}
            >
              MAKE OWNER
            </button>
          ))}

        {editable && (
          <button
            className="mono member-row-action member-row-remove"
            type="button"
            disabled={busy}
            onClick={handleRemove}
          >
            REMOVE
          </button>
        )}
      </div>
    </li>
  )
}

export default MemberList
