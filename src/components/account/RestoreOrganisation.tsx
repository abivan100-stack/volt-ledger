import { useEffect, useState } from 'react'
import { getApiErrorMessage } from '../../api/errors'
import { isWithinRecoveryWindow, recoveryWindowLabel } from '../../lib/retention'
import { useOrganisationStore } from '../../store/useOrganisationStore'
import './RestoreOrganisation.css'

/**
 * Undoing an archive.
 *
 * This surface is what makes the recovery window real. An archived organisation
 * has no active memberships, so it never appears in the ordinary selector — and
 * without somewhere to find it again, a thirty-day window would only be
 * reachable by someone who never closed the tab after archiving.
 *
 * Nothing renders when there is nothing to undo, which is the ordinary case;
 * a permanent empty "Archived organisations" heading would suggest a feature
 * where there is only an absence.
 */
function RestoreOrganisation() {
  const archived = useOrganisationStore((state) => state.archived)
  const status = useOrganisationStore((state) => state.archivedStatus)
  const error = useOrganisationStore((state) => state.archivedError)

  useEffect(() => {
    if (status === 'unknown') void useOrganisationStore.getState().loadArchived()
  }, [status])

  if (status === 'error') {
    return (
      <section className="restore-organisation">
        <p className="account-error" role="alert">
          {error}
        </p>
        <button
          className="mono restore-retry"
          type="button"
          onClick={() => void useOrganisationStore.getState().loadArchived()}
        >
          RETRY
        </button>
      </section>
    )
  }

  if (archived.length === 0) return null

  return (
    <section className="restore-organisation">
      <h3 className="mono restore-heading">ARCHIVED — CAN STILL BE RESTORED</h3>
      <p className="restore-intro">
        Restoring brings back the members and simulation data the archive removed. Invitations that
        were revoked are not reissued, and once the window closes the working data is deleted for
        good.
      </p>
      <ul className="restore-list">
        {archived.map((organisation) => (
          <ArchivedEntry key={organisation.id} organisation={organisation} />
        ))}
      </ul>
    </section>
  )
}

interface ArchivedEntryProps {
  organisation: {
    id: string
    name: string
    slug: string
    archivedAt: string
    restorableUntil: string
  }
}

function ArchivedEntry({ organisation }: ArchivedEntryProps) {
  const [restoring, setRestoring] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const deadline = new Date(organisation.restorableUntil)
  const now = new Date()
  const open = isWithinRecoveryWindow(deadline, now)

  const handleRestore = async (): Promise<void> => {
    if (restoring) return
    setRestoring(true)
    setError(null)
    try {
      await useOrganisationStore.getState().restore(organisation.id)
      // The entry leaves the archived list, so this unmounts.
    } catch (caught) {
      setError(
        getApiErrorMessage(caught, 'The organisation could not be restored.'),
      )
      setRestoring(false)
    }
  }

  return (
    <li className="restore-entry">
      <div className="restore-entry-detail">
        <span className="restore-entry-name">{organisation.name}</span>
        <span className="mono restore-entry-slug">{organisation.slug}</span>
        <span className="mono restore-entry-window">
          {recoveryWindowLabel(deadline, now)}
          {open && ` — until ${deadline.toUTCString()}`}
        </span>
      </div>

      {error !== null && (
        <p className="account-error" role="alert">
          {error}
        </p>
      )}

      <button
        className="mono restore-confirm"
        type="button"
        onClick={() => void handleRestore()}
        disabled={restoring || !open}
        aria-busy={restoring}
        aria-label={`Restore ${organisation.name}`}
      >
        {restoring ? 'RESTORE…' : 'RESTORE'}
      </button>
    </li>
  )
}

export default RestoreOrganisation
