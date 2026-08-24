import { create } from 'zustand'
import { ApiError, getApiErrorMessage } from '../api/errors'
import {
  createSimulationRun,
  getSimulationQuota,
  getSimulationResults,
  getSimulationRun,
  listSimulationRuns,
  type CreateSimulationInput,
  type SimulationQuota,
  type SimulationResults,
  type SimulationRun,
} from '../api/simulations'
import { useOrganisationStore } from './useOrganisationStore'
import { requireOrganisationId } from './organisationScope'
import { useSessionStore } from './useSessionStore'

/**
 * Simulation runs, quota, and results for the selected organisation.
 *
 * Runs are executed by a separate worker, so submitting one only queues it. The
 * store tracks which runs are still moving (`queued`/`running`) so a poller knows
 * when to keep asking and, more importantly, when to stop.
 */

export type SimulationStoreStatus = 'unknown' | 'loading' | 'ready' | 'error'

export type ResultsStatus = 'idle' | 'loading' | 'ready' | 'pending' | 'error'

/** Statuses a run can still move on from. */
const ACTIVE_STATUSES = new Set(['queued', 'running'])

export function isActiveRun(run: SimulationRun): boolean {
  return ACTIVE_STATUSES.has(run.status)
}

export interface SimulationState {
  organisationId: string | null
  status: SimulationStoreStatus
  runs: SimulationRun[]
  quota: SimulationQuota | null
  error: string | null
  pendingLoad: Promise<void> | null
  requestGeneration: number
  selectedRunId: string | null
  results: SimulationResults | null
  resultsStatus: ResultsStatus
  resultsError: string | null
  load: (organisationId: string) => Promise<void>
  refreshQuota: () => Promise<void>
  submit: (input: CreateSimulationInput) => Promise<SimulationRun>
  /** Re-reads every run that is still queued or running. */
  refreshActiveRuns: () => Promise<void>
  selectRun: (runId: string | null) => void
  loadResults: (runId: string) => Promise<void>
  reset: () => void
}

const EMPTY: Omit<
  SimulationState,
  'load' | 'refreshQuota' | 'submit' | 'refreshActiveRuns' | 'selectRun' | 'loadResults' | 'reset'
> = {
  organisationId: null,
  status: 'unknown',
  runs: [],
  quota: null,
  error: null,
  pendingLoad: null,
  requestGeneration: 0,
  selectedRunId: null,
  results: null,
  resultsStatus: 'idle',
  resultsError: null,
}

export const useSimulationStore = create<SimulationState>()((set, get) => ({
  ...EMPTY,

  load: (organisationId) => {
    const state = get()
    if (state.pendingLoad && state.organisationId === organisationId) return state.pendingLoad

    const requestGeneration =
      state.organisationId === organisationId ? state.requestGeneration : state.requestGeneration + 1
    const isCurrent = () =>
      get().organisationId === organisationId && get().requestGeneration === requestGeneration
    set({ organisationId, status: 'loading', error: null, requestGeneration })
    const loading = Promise.all([
      listSimulationRuns(organisationId, { limit: 20 }),
      getSimulationQuota(organisationId),
    ])
      .then(([runs, quota]) => {
        if (!isCurrent()) return
        set({ status: 'ready', runs, quota, error: null })
      })
      .catch((error: unknown) => {
        if (!isCurrent()) return
        set({ status: 'error', error: getApiErrorMessage(error, 'The simulations could not be loaded') })
      })
      .finally(() => {
        if (isCurrent()) set({ pendingLoad: null })
      })

    set({ pendingLoad: loading })
    return loading
  },

  refreshQuota: async () => {
    const organisationId = get().organisationId
    if (!organisationId) return
    const requestGeneration = get().requestGeneration
    const quota = await getSimulationQuota(organisationId)
    if (get().organisationId !== organisationId || get().requestGeneration !== requestGeneration) return
    set({ quota })
  },

  submit: async (input) => {
    const organisationId = requireOrganisationId(get().organisationId)
    const requestGeneration = get().requestGeneration
    const run = await createSimulationRun(organisationId, input)
    if (get().organisationId !== organisationId || get().requestGeneration !== requestGeneration) return run
    set((state) => ({ runs: [run, ...state.runs], selectedRunId: run.id }))
    // One unit of the daily allowance has just been spent.
    await get().refreshQuota()
    return run
  },

  refreshActiveRuns: async () => {
    const organisationId = get().organisationId
    if (!organisationId) return
    const requestGeneration = get().requestGeneration

    const active = get().runs.filter(isActiveRun)
    if (active.length === 0) return

    const refreshed = await Promise.all(
      active.map((run) =>
        getSimulationRun(organisationId, run.id).catch(() => null),
      ),
    )

    // The organisation may have changed while these were in flight.
    if (get().organisationId !== organisationId || get().requestGeneration !== requestGeneration) return

    const byId = new Map(
      refreshed.filter((run): run is SimulationRun => run !== null).map((run) => [run.id, run]),
    )
    if (byId.size === 0) return
    set((state) => ({ runs: state.runs.map((run) => byId.get(run.id) ?? run) }))
  },

  selectRun: (runId) => {
    if (runId === get().selectedRunId) return
    set({ selectedRunId: runId, results: null, resultsStatus: 'idle', resultsError: null })
  },

  loadResults: async (runId) => {
    const organisationId = requireOrganisationId(get().organisationId)
    const requestGeneration = get().requestGeneration
    set({ selectedRunId: runId, resultsStatus: 'loading', resultsError: null })
    try {
      const results = await getSimulationResults(organisationId, runId, { limit: 2_000 })
      if (get().organisationId !== organisationId || get().requestGeneration !== requestGeneration || get().selectedRunId !== runId) return
      set({ results, resultsStatus: 'ready', resultsError: null })
    } catch (error) {
      if (get().organisationId !== organisationId || get().requestGeneration !== requestGeneration || get().selectedRunId !== runId) return
      // "Not complete yet" is a normal state for a queued run, not a failure.
      if (error instanceof ApiError && error.code === 'SIMULATION_NOT_COMPLETE') {
        set({ results: null, resultsStatus: 'pending', resultsError: null })
        return
      }
      set({
        results: null,
        resultsStatus: 'error',
        resultsError: getApiErrorMessage(error, 'The results could not be loaded'),
      })
    }
  },

  reset: () => set((state) => ({ ...EMPTY, requestGeneration: state.requestGeneration + 1 })),
}))

useOrganisationStore.subscribe((state, previous) => {
  if (state.selectedId === previous.selectedId) return
  if (state.selectedId === useSimulationStore.getState().organisationId) return
  useSimulationStore.getState().reset()
})

useSessionStore.subscribe((state, previous) => {
  if (previous.status === 'authenticated' && state.status !== 'authenticated') {
    useSimulationStore.getState().reset()
  }
})
