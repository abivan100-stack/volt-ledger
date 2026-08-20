import { useEffect, useState, type FormEvent } from 'react'
import type { AuditEvent } from '../../api/audit'
import { canViewAuditEvents } from '../../lib/permissions'
import { useAuditStore } from '../../store/useAuditStore'
import { useOrganisationStore } from '../../store/useOrganisationStore'
import './AuditPanel.css'

/**
 * The organisation's audit history, newest first.
 *
 * Only owners and admins may read the route, so the panel renders nothing for
 * operators and viewers. Paging follows the API's opaque cursor and appends, so
 * the list grows into one continuous history rather than jumping between pages.
 */
function AuditPanel() {
  const organisation = useOrganisationStore((state) => state.selected())
  if (!organisation || !canViewAuditEvents(organisation.role)) return null
  return <OrganisationAudit organisationId={organisation.id} />
}

function OrganisationAudit({ organisationId }: { organisationId: string }) {
  const { status, events, nextCursor, action, loadingMore, error } = useAuditStore()
  const [filterDraft, setFilterDraft] = useState('')

  useEffect(() => {
    if (useAuditStore.getState().organisationId === organisationId) return
    void useAuditStore.getState().load(organisationId)
  }, [organisationId])

  const applyFilter = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    const trimmed = filterDraft.trim()
    void useAuditStore.getState().setAction(trimmed === '' ? null : trimmed)
  }

  const clearFilter = (): void => {
    setFilterDraft('')
    void useAuditStore.getState().setAction(null)
  }

  return (
    <section className="audit-panel">
      <h3 className="audit-panel-heading">Audit history</h3>
      <p className="audit-note">
        Retained for provenance, including after an organisation is archived.
      </p>

      <form className="audit-filter" onSubmit={applyFilter}>
        <label className="account-field audit-filter-field">
          <span className="mono account-field-label">FILTER BY ACTION</span>
          <input
            className="account-input mono"
            type="text"
            name="auditAction"
            autoComplete="off"
            placeholder="organisation.created"
            value={filterDraft}
            onChange={(event) => setFilterDraft(event.target.value)}
          />
        </label>
        <div className="audit-filter-actions">
          <button className="mono audit-filter-apply" type="submit">
            APPLY
          </button>
          {action !== null && (
            <button className="mono audit-filter-clear" type="button" onClick={clearFilter}>
              CLEAR
            </button>
          )}
        </div>
      </form>

      {action !== null && (
        <p className="mono audit-active-filter">{`SHOWING ONLY ${action}`}</p>
      )}

      {(status === 'unknown' || status === 'loading') && (
        <p className="account-notice" role="status">
          Loading audit history…
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
            onClick={() => void useAuditStore.getState().load(organisationId)}
          >
            RETRY
          </button>
        </>
      )}

      {status === 'ready' && (
        <>
          {events.length === 0 ? (
            <p className="audit-empty">
              {action === null
                ? 'No audit events recorded yet.'
                : 'No audit events match that action.'}
            </p>
          ) : (
            <ol className="audit-events">
              {events.map((event) => (
                <AuditRow key={event.id} event={event} />
              ))}
            </ol>
          )}

          {/* A page-level failure is shown without discarding what already loaded. */}
          {error !== null && (
            <p className="account-error" role="alert">
              {error}
            </p>
          )}

          {nextCursor !== null && (
            <button
              className="mono audit-more"
              type="button"
              disabled={loadingMore}
              aria-busy={loadingMore}
              onClick={() => void useAuditStore.getState().loadMore()}
            >
              {loadingMore ? 'LOAD OLDER…' : 'LOAD OLDER'}
            </button>
          )}
        </>
      )}
    </section>
  )
}

function AuditRow({ event }: { event: AuditEvent }) {
  return (
    <li className="audit-event">
      <div className="audit-event-head">
        <span className="mono audit-event-action">{event.action}</span>
        <time className="mono audit-event-time" dateTime={event.createdAt}>
          {new Date(event.createdAt).toUTCString()}
        </time>
      </div>
      <p className="mono audit-event-entity">{`${event.entityType} ${event.entityId}`}</p>
    </li>
  )
}

export default AuditPanel
