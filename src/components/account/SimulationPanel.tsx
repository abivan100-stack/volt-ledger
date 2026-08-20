import { useEffect, useState, type FormEvent } from 'react'
import { ApiError } from '../../api/errors'
import {
  SIMULATION_DAY_TYPES,
  type CreateSimulationInput,
  type SimulationDayType,
  type SimulationRun,
} from '../../api/simulations'
import { canRunSimulations } from '../../lib/permissions'
import { useSimulationPolling } from '../../hooks/useSimulationPolling'
import { useOrganisationStore } from '../../store/useOrganisationStore'
import { useSimulationStore } from '../../store/useSimulationStore'
import './SimulationPanel.css'

/**
 * Simulation runs for the selected organisation: the daily allowance, a
 * submission form, the run list with live status, and the accepted outcome
 * bands of a completed run.
 *
 * Everything here is synthetic. A run is queued rather than computed in the
 * request, so the list is polled until the worker settles it.
 */
function SimulationPanel() {
  const organisation = useOrganisationStore((state) => state.selected())
  if (!organisation) return null
  return <OrganisationSimulations organisationId={organisation.id} canRun={canRunSimulations(organisation.role)} />
}

interface OrganisationSimulationsProps {
  organisationId: string
  canRun: boolean
}

function messageFor(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message
  return fallback
}

function OrganisationSimulations({ organisationId, canRun }: OrganisationSimulationsProps) {
  const { status, runs, quota, error } = useSimulationStore()
  useSimulationPolling()

  useEffect(() => {
    if (useSimulationStore.getState().organisationId === organisationId) return
    void useSimulationStore.getState().load(organisationId)
  }, [organisationId])

  return (
    <section className="simulation-panel">
      <h3 className="simulation-panel-heading">Simulations</h3>
      <p className="simulation-disclaimer">
        Synthetic scenarios only — not meter readings, forecasts, or settled energy.
      </p>

      {quota && <QuotaReadout used={quota.used} limit={quota.limit} remaining={quota.remaining} resetsAt={quota.resetsAt} />}

      {canRun ? (
        <SubmitRunForm exhausted={quota?.remaining === 0} />
      ) : (
        <p className="simulation-readonly">Your role can view simulation runs but not start them.</p>
      )}

      {(status === 'unknown' || status === 'loading') && (
        <p className="account-notice" role="status">
          Loading simulation runs…
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
            onClick={() => void useSimulationStore.getState().load(organisationId)}
          >
            RETRY
          </button>
        </>
      )}

      {status === 'ready' &&
        (runs.length === 0 ? (
          <p className="simulation-empty">No simulation runs yet.</p>
        ) : (
          <ul className="simulation-runs">
            {runs.map((run) => (
              <RunRow key={run.id} run={run} />
            ))}
          </ul>
        ))}

      <RunResults />
    </section>
  )
}

interface QuotaReadoutProps {
  used: number
  limit: number
  remaining: number
  resetsAt: string
}

function QuotaReadout({ used, limit, remaining, resetsAt }: QuotaReadoutProps) {
  return (
    <p className="mono simulation-quota" data-exhausted={remaining === 0}>
      {`DAILY RUNS ${used}/${limit}`}
      <span className="simulation-quota-detail">
        {remaining === 0
          ? ` — exhausted, resets ${new Date(resetsAt).toUTCString()}`
          : ` — ${remaining} remaining today`}
      </span>
    </p>
  )
}

const DEFAULT_HOUSEHOLDS = 10

function SubmitRunForm({ exhausted }: { exhausted: boolean }) {
  const [seed, setSeed] = useState('')
  const [simulationDate, setSimulationDate] = useState('')
  const [dayType, setDayType] = useState<SimulationDayType>('sunny-weekday')
  const [householdCount, setHouseholdCount] = useState(DEFAULT_HOUSEHOLDS)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (submitting) return

    if (!seed.trim()) {
      setError('Enter a seed. The same seed and inputs replay identically.')
      return
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(simulationDate)) {
      setError('Enter a simulation date as YYYY-MM-DD.')
      return
    }

    const input: CreateSimulationInput = {
      seed: seed.trim(),
      simulationDate,
      dayType,
      households: Array.from({ length: householdCount }, (_, index) => ({
        id: `h${index + 1}`,
        pvKw: 3,
        baseLoadKw: 1,
      })),
    }

    setSubmitting(true)
    setError(null)
    try {
      await useSimulationStore.getState().submit(input)
      setSeed('')
    } catch (caught) {
      setError(messageFor(caught, 'The simulation could not be queued.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="account-form simulation-form" onSubmit={handleSubmit} noValidate>
      <label className="account-field">
        <span className="mono account-field-label">SEED</span>
        <input
          className="account-input mono"
          type="text"
          name="seed"
          autoComplete="off"
          value={seed}
          onChange={(event) => setSeed(event.target.value)}
        />
        <span className="account-field-hint">
          Runs are replayable: the same seed, model version, and inputs produce identical results.
        </span>
      </label>

      <label className="account-field">
        <span className="mono account-field-label">SIMULATION DATE</span>
        <input
          className="account-input mono"
          type="date"
          name="simulationDate"
          value={simulationDate}
          onChange={(event) => setSimulationDate(event.target.value)}
        />
      </label>

      <label className="account-field">
        <span className="mono account-field-label">DAY TYPE</span>
        <select
          className="account-input"
          value={dayType}
          onChange={(event) => setDayType(event.target.value as SimulationDayType)}
        >
          {SIMULATION_DAY_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </label>

      <label className="account-field">
        <span className="mono account-field-label">HOUSEHOLDS</span>
        <input
          className="account-input mono"
          type="number"
          name="householdCount"
          min={1}
          max={50}
          value={householdCount}
          onChange={(event) => setHouseholdCount(Number(event.target.value))}
        />
      </label>

      {error !== null && (
        <p className="account-error" role="alert">
          {error}
        </p>
      )}

      <button
        className="mono account-submit"
        type="submit"
        disabled={submitting || exhausted}
        aria-busy={submitting}
      >
        {submitting ? 'QUEUE SIMULATION…' : 'QUEUE SIMULATION'}
      </button>
    </form>
  )
}

function RunRow({ run }: { run: SimulationRun }) {
  const selected = useSimulationStore((state) => state.selectedRunId === run.id)

  return (
    <li className="simulation-run" data-selected={selected}>
      <button
        className="simulation-run-button"
        type="button"
        onClick={() => void useSimulationStore.getState().loadResults(run.id)}
      >
        <span className="mono simulation-run-seed">{run.seed}</span>
        <span className={`mono simulation-run-status simulation-run-status-${run.status}`}>
          {run.status.toUpperCase()}
        </span>
      </button>
      {run.errorCode && <span className="mono simulation-run-error">{run.errorCode}</span>}
    </li>
  )
}

function RunResults() {
  const { resultsStatus, results, resultsError } = useSimulationStore()

  if (resultsStatus === 'idle') return null

  if (resultsStatus === 'loading') {
    return (
      <p className="account-notice" role="status">
        Loading results…
      </p>
    )
  }

  if (resultsStatus === 'pending') {
    return (
      <p className="account-notice" role="status">
        This run has not finished yet. Results appear once the worker completes it.
      </p>
    )
  }

  if (resultsStatus === 'error') {
    return (
      <p className="account-error" role="alert">
        {resultsError}
      </p>
    )
  }

  if (!results) return null

  return (
    <div className="simulation-results">
      <p className="mono simulation-results-digest">
        {`RESULT DIGEST ${results.run.resultDigest ?? '—'}`}
      </p>
      {results.summaries.length === 0 ? (
        <p className="simulation-empty">This run produced no summaries.</p>
      ) : (
        <table className="simulation-summary-table">
          <caption className="simulation-summary-caption">
            Per-household synthetic outcome bands
          </caption>
          <thead>
            <tr>
              <th scope="col">Household</th>
              <th scope="col">Outcome</th>
              <th scope="col">Exported kWh</th>
              <th scope="col">Estimated credit</th>
            </tr>
          </thead>
          <tbody>
            {results.summaries.map((summary) => (
              <tr key={summary.id}>
                <td>{summary.householdId}</td>
                <td className="mono">{summary.outcome}</td>
                <td className="mono">{summary.exportedKwh.toFixed(2)}</td>
                <td className="mono">{`₹${summary.estimatedCreditInr.toFixed(2)}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export default SimulationPanel
