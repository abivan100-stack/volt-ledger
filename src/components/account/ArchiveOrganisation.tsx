import { useState, type FormEvent } from 'react'
import { getApiErrorMessage } from '../../api/errors'
import { canArchiveOrganisation } from '../../lib/permissions'
import { useOrganisationStore } from '../../store/useOrganisationStore'
import './ArchiveOrganisation.css'

/**
 * Owner-only organisation archival.
 *
 * Archiving is soft: it removes active access and working simulation data in one
 * transaction while ledger and audit history are retained for provenance. It can
 * be undone from `RestoreOrganisation` for a window afterwards, and not at all
 * once that window closes — so the control stays behind a disclosure and still
 * requires the organisation's identifier to be typed out. A recoverable mistake
 * is not a harmless one: everyone else loses access the moment this succeeds.
 */
function ArchiveOrganisation() {
  const organisation = useOrganisationStore((state) => state.selected())
  const [open, setOpen] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (!organisation || !canArchiveOrganisation(organisation.role)) return null

  const close = (): void => {
    setOpen(false)
    setConfirmation('')
    setError(null)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (submitting) return

    if (confirmation !== organisation.slug) {
      setError(`Type ${organisation.slug} exactly to confirm.`)
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      await useOrganisationStore.getState().archive(organisation.id)
      // The organisation is gone from the list, so the panel unmounts this.
    } catch (caught) {
      setError(
        getApiErrorMessage(caught, 'The organisation could not be archived.'),
      )
      setSubmitting(false)
    }
  }

  if (!open) {
    return (
      <section className="archive-organisation">
        <button className="mono archive-open" type="button" onClick={() => setOpen(true)}>
          ARCHIVE ORGANISATION
        </button>
      </section>
    )
  }

  return (
    <section className="archive-organisation">
      <form className="archive-form" onSubmit={handleSubmit} noValidate>
        <p className="archive-warning">
          Archiving <strong>{organisation.name}</strong> removes every member&apos;s access and
          soft-deletes its simulation runs and results. Ledger and audit history are retained for
          provenance. You can restore it for a limited time afterwards; once that window closes the
          simulation data is deleted permanently. Pending invitations are revoked and are not
          reissued by a restore.
        </p>

        <label className="account-field">
          <span className="mono account-field-label">
            {`TYPE "${organisation.slug}" TO CONFIRM`}
          </span>
          <input
            className="account-input mono"
            type="text"
            name="archiveConfirmation"
            autoComplete="off"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
          />
        </label>

        {error !== null && (
          <p className="account-error" role="alert">
            {error}
          </p>
        )}

        <div className="archive-actions">
          <button
            className="mono archive-confirm"
            type="submit"
            disabled={submitting}
            aria-busy={submitting}
          >
            {submitting ? 'ARCHIVE ORGANISATION…' : 'ARCHIVE ORGANISATION'}
          </button>
          <button className="mono archive-cancel" type="button" onClick={close}>
            CANCEL
          </button>
        </div>
      </form>
    </section>
  )
}

export default ArchiveOrganisation
