import { useEffect, useState, type FormEvent } from 'react'
import { getApiErrorMessage } from '../../api/errors'
import type { LedgerEvent, LedgerIntegrity } from '../../api/ledger'
import { SIMULATION_OUTCOMES, type SimulationOutcome } from '../../api/simulations'
import { canSettleAndAdjustLedger } from '../../lib/permissions'
import { useLedgerStore } from '../../store/useLedgerStore'
import { useOrganisationStore } from '../../store/useOrganisationStore'
import { useSimulationStore } from '../../store/useSimulationStore'
import './LedgerPanel.css'

/**
 * The organisation's append-only settlement ledger.
 *
 * Nothing here edits history. An owner or admin can accept a completed run's
 * outcome — which appends one immutable event per household — or append a signed
 * correction against an existing event. Every member can read the chain and the
 * server's integrity verdict on it.
 */
function LedgerPanel() {
  const organisation = useOrganisationStore((state) => state.selected())
  if (!organisation) return null
  return (
    <OrganisationLedger
      organisationId={organisation.id}
      canSettle={canSettleAndAdjustLedger(organisation.role)}
    />
  )
}

interface OrganisationLedgerProps {
  organisationId: string
  canSettle: boolean
}

function OrganisationLedger({ organisationId, canSettle }: OrganisationLedgerProps) {
  const { status, events, integrity, error } = useLedgerStore()

  useEffect(() => {
    if (useLedgerStore.getState().organisationId === organisationId) return
    void useLedgerStore.getState().load(organisationId)
  }, [organisationId])

  return (
    <section className="ledger-panel">
      <h3 className="ledger-panel-heading">Settlement ledger</h3>
      <p className="ledger-disclaimer">
        Immutable, hash-linked events. Energy is an accepted outcome&apos;s synthetic exported kWh —
        not a meter reading or a payment. Corrections are appended, never edited in.
      </p>

      {canSettle && <SettleRunForm />}

      {(status === 'unknown' || status === 'loading') && (
        <p className="account-notice" role="status">
          Loading ledger…
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
            onClick={() => void useLedgerStore.getState().load(organisationId)}
          >
            RETRY
          </button>
        </>
      )}

      {status === 'ready' && (
        <>
          {integrity && <IntegrityReadout integrity={integrity} />}
          {events.length === 0 ? (
            <p className="ledger-empty">No settlements have been accepted yet.</p>
          ) : (
            <ul className="ledger-events">
              {events.map((event) => (
                <LedgerRow key={event.id} event={event} canAdjust={canSettle} />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  )
}

function IntegrityReadout({ integrity }: { integrity: LedgerIntegrity }) {
  const intact = integrity.valid && integrity.complete
  return (
    <p
      className="mono ledger-integrity"
      data-valid={integrity.valid}
      role={integrity.valid ? undefined : 'alert'}
    >
      {integrity.valid ? 'CHAIN VERIFIED' : 'INTEGRITY VOID'}
      <span className="ledger-integrity-detail">
        {` — ${integrity.checkedEvents} events checked`}
        {integrity.valid && !integrity.complete
          ? ', partial slice (does not start at sequence 1)'
          : ''}
        {intact ? ', sealed end to end' : ''}
      </span>
    </p>
  )
}

/** Accepts one completed run's outcome into the ledger. */
function SettleRunForm() {
  // Select the array itself and filter here: a selector returning a fresh array
  // changes identity on every render and would loop forever.
  const runs = useSimulationStore((state) => state.runs)
  const completedRuns = runs.filter((run) => run.status === 'completed')
  const [runId, setRunId] = useState('')
  const [outcome, setOutcome] = useState<SimulationOutcome>('selected')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (completedRuns.length === 0) {
    return (
      <p className="ledger-empty">
        Accepting a settlement needs a completed simulation run.
      </p>
    )
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (submitting) return

    const chosen = runId || completedRuns[0]?.id
    if (!chosen) return

    setSubmitting(true)
    setError(null)
    setNotice(null)
    try {
      const settlement = await useLedgerStore.getState().settle(chosen, outcome)
      setNotice(
        settlement.alreadySettled
          ? 'This run was already settled with that outcome; nothing was appended.'
          : `Accepted ${settlement.events.length} settlement events.`,
      )
    } catch (caught) {
      setError(getApiErrorMessage(caught, 'The settlement could not be accepted.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="account-form ledger-settle-form" onSubmit={handleSubmit} noValidate>
      <label className="account-field">
        <span className="mono account-field-label">COMPLETED RUN</span>
        <select
          className="account-input"
          value={runId || (completedRuns[0]?.id ?? '')}
          onChange={(changed) => setRunId(changed.target.value)}
        >
          {completedRuns.map((run) => (
            <option key={run.id} value={run.id}>
              {run.seed}
            </option>
          ))}
        </select>
      </label>

      <label className="account-field">
        <span className="mono account-field-label">OUTCOME</span>
        <select
          className="account-input"
          value={outcome}
          onChange={(changed) => setOutcome(changed.target.value as SimulationOutcome)}
        >
          {SIMULATION_OUTCOMES.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <span className="account-field-hint">
          Accepting is idempotent, but a run already settled with a different outcome is refused.
        </span>
      </label>

      {error !== null && (
        <p className="account-error" role="alert">
          {error}
        </p>
      )}

      {notice !== null && (
        <p className="account-confirmation" role="status">
          {notice}
        </p>
      )}

      <button className="mono account-submit" type="submit" disabled={submitting} aria-busy={submitting}>
        {submitting ? 'ACCEPT SETTLEMENT…' : 'ACCEPT SETTLEMENT'}
      </button>
    </form>
  )
}

function LedgerRow({ event, canAdjust }: { event: LedgerEvent; canAdjust: boolean }) {
  const [adjusting, setAdjusting] = useState(false)

  return (
    <li className="ledger-event" data-type={event.eventType}>
      <div className="ledger-event-head">
        <span className="mono ledger-event-sequence">{`#${event.sequence}`}</span>
        <span className="mono ledger-event-type">{event.eventType.toUpperCase()}</span>
        <span className="ledger-event-household">{event.householdId}</span>
        <span className="mono ledger-event-energy">{`${event.energyKwh.toFixed(2)} kWh`}</span>
        <span className="mono ledger-event-credit">{`₹${event.estimatedCreditInr.toFixed(2)}`}</span>
      </div>

      <p className="mono ledger-event-seal">{`SEAL ${event.canonicalSeal}`}</p>

      {event.adjustmentReason && (
        <p className="ledger-event-reason">{`Correction: ${event.adjustmentReason}`}</p>
      )}

      {canAdjust && event.eventType === 'settlement' && (
        adjusting ? (
          <AdjustmentForm targetEventId={event.id} onDone={() => setAdjusting(false)} />
        ) : (
          <button
            className="mono ledger-adjust-open"
            type="button"
            onClick={() => setAdjusting(true)}
          >
            APPEND CORRECTION
          </button>
        )
      )}
    </li>
  )
}

function AdjustmentForm({
  targetEventId,
  onDone,
}: {
  targetEventId: string
  onDone: () => void
}) {
  const [energyKwh, setEnergyKwh] = useState('0')
  const [estimatedCreditInr, setEstimatedCreditInr] = useState('0')
  const [reason, setReason] = useState('')
  const [idempotencyKey, setIdempotencyKey] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (submitting) return

    const energy = Number(energyKwh)
    const credit = Number(estimatedCreditInr)
    if (!Number.isFinite(energy) || !Number.isFinite(credit)) {
      setError('Enter numeric deltas.')
      return
    }
    if (energy === 0 && credit === 0) {
      setError('An adjustment must change energy or estimated credit.')
      return
    }
    if (reason.trim().length < 3) {
      setError('Give a reason of at least 3 characters; it is recorded permanently.')
      return
    }
    if (!idempotencyKey.trim()) {
      setError('Give an idempotency key so a retry cannot double-count.')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      await useLedgerStore.getState().adjust({
        targetEventId,
        idempotencyKey: idempotencyKey.trim(),
        energyKwh: energy,
        estimatedCreditInr: credit,
        reason: reason.trim(),
      })
      onDone()
    } catch (caught) {
      setError(getApiErrorMessage(caught, 'The correction could not be appended.'))
      setSubmitting(false)
    }
  }

  return (
    <form className="account-form ledger-adjust-form" onSubmit={handleSubmit} noValidate>
      <p className="ledger-adjust-note">
        This appends a new event carrying a signed delta. The event above is never modified.
      </p>

      <label className="account-field">
        <span className="mono account-field-label">ENERGY DELTA (KWH)</span>
        <input
          className="account-input mono"
          type="number"
          step="any"
          value={energyKwh}
          onChange={(changed) => setEnergyKwh(changed.target.value)}
        />
      </label>

      <label className="account-field">
        <span className="mono account-field-label">CREDIT DELTA (INR)</span>
        <input
          className="account-input mono"
          type="number"
          step="any"
          value={estimatedCreditInr}
          onChange={(changed) => setEstimatedCreditInr(changed.target.value)}
        />
      </label>

      <label className="account-field">
        <span className="mono account-field-label">REASON</span>
        <input
          className="account-input"
          type="text"
          value={reason}
          onChange={(changed) => setReason(changed.target.value)}
        />
      </label>

      <label className="account-field">
        <span className="mono account-field-label">IDEMPOTENCY KEY</span>
        <input
          className="account-input mono"
          type="text"
          autoComplete="off"
          value={idempotencyKey}
          onChange={(changed) => setIdempotencyKey(changed.target.value)}
        />
        <span className="account-field-hint">
          Replaying the same key with the same values is a no-op; reusing it with different values
          is refused.
        </span>
      </label>

      {error !== null && (
        <p className="account-error" role="alert">
          {error}
        </p>
      )}

      <div className="ledger-adjust-actions">
        <button className="mono account-submit" type="submit" disabled={submitting} aria-busy={submitting}>
          {submitting ? 'APPEND CORRECTION…' : 'APPEND CORRECTION'}
        </button>
        <button className="mono ledger-adjust-cancel" type="button" onClick={onDone}>
          CANCEL
        </button>
      </div>
    </form>
  )
}

export default LedgerPanel
