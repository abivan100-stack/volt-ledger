import { useId, useState } from 'react'
import { roleLabel } from '../../lib/permissions'
import { useOrganisations } from '../../hooks/useOrganisations'
import { useOrganisationStore } from '../../store/useOrganisationStore'
import { useSessionStore } from '../../store/useSessionStore'
import CreateOrganisationForm from './CreateOrganisationForm'
import ArchiveOrganisation from './ArchiveOrganisation'
import AuditPanel from './AuditPanel'
import InvitationPanel from './InvitationPanel'
import LedgerPanel from './LedgerPanel'
import MemberList from './MemberList'
import RestoreOrganisation from './RestoreOrganisation'
import SimulationPanel from './SimulationPanel'
import './OrganisationPanel.css'

/**
 * Organisation selection for the signed-in user.
 *
 * Renders nothing at all when signed out: organisations are session-scoped, and
 * an empty selector would read as "you have none" rather than "you are not
 * signed in".
 */
function OrganisationPanel() {
  const signedIn = useSessionStore((session) => session.status === 'authenticated')
  if (!signedIn) return null
  return <SignedInOrganisations />
}

function SignedInOrganisations() {
  const { status, organisations, selectedId, error, selected } = useOrganisations()
  const selectId = useOrganisationStore((state) => state.select)
  const selectorId = useId()
  const [creating, setCreating] = useState(false)

  if (status === 'unknown' || status === 'loading') {
    return (
      <section className="organisation-panel">
        <p className="account-notice" role="status">
          Loading your organisations…
        </p>
      </section>
    )
  }

  if (status === 'error') {
    return (
      <section className="organisation-panel">
        <p className="account-error" role="alert">
          {error}
        </p>
        <button
          className="mono account-submit"
          type="button"
          onClick={() => void useOrganisationStore.getState().load()}
        >
          RETRY
        </button>
      </section>
    )
  }

  if (organisations.length === 0) {
    return (
      <section className="organisation-panel">
        <h2 className="serif organisation-panel-heading">Organisations</h2>
        <p className="account-notice" role="status">
          You are not a member of any organisation yet. Create your first organisation to run
          simulations and keep a settlement ledger.
        </p>
        <CreateOrganisationForm />
        {/* Archiving your only organisation lands you here, which is exactly
            where the undo has to be reachable. */}
        <RestoreOrganisation />
      </section>
    )
  }

  const current = selected()

  return (
    <section className="organisation-panel">
      <h2 className="serif organisation-panel-heading">Organisations</h2>

      <div className="organisation-selector">
        <label className="account-field" htmlFor={selectorId}>
          <span className="mono account-field-label">ORGANISATION</span>
        </label>
        <select
          id={selectorId}
          className="account-input organisation-select"
          value={selectedId ?? ''}
          onChange={(event) => selectId(event.target.value)}
        >
          {organisations.map((organisation) => (
            <option key={organisation.id} value={organisation.id}>
              {organisation.name}
            </option>
          ))}
        </select>
        {current && <span className="mono organisation-role">{roleLabel(current.role)}</span>}
      </div>

      {creating ? (
        <CreateOrganisationForm onCreated={() => setCreating(false)} />
      ) : (
        <button
          className="mono organisation-new"
          type="button"
          onClick={() => setCreating(true)}
        >
          NEW ORGANISATION
        </button>
      )}

      <MemberList />
      <InvitationPanel />
      <SimulationPanel />
      <LedgerPanel />
      <AuditPanel />
      <ArchiveOrganisation />
      <RestoreOrganisation />
    </section>
  )
}

export default OrganisationPanel
