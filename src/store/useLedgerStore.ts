import { create } from 'zustand'
import { getApiErrorMessage } from '../api/errors'
import {
  createLedgerAdjustment,
  listLedgerEvents,
  settleSimulationRun,
  type CreateAdjustmentInput,
  type LedgerEvent,
  type LedgerIntegrity,
  type Settlement,
} from '../api/ledger'
import type { SimulationOutcome } from '../api/simulations'
import { useOrganisationStore } from './useOrganisationStore'
import { requireOrganisationId } from './organisationScope'
import { useSessionStore } from './useSessionStore'

/**
 * The organisation's append-only settlement ledger.
 *
 * The store never edits an event. Settling appends events, and an adjustment
 * appends one more carrying a signed delta — both arrive from the server already
 * sealed. After either, the whole slice is re-read so the integrity report shown
 * to the user is the server's verdict on what is actually stored, not something
 * inferred locally.
 */

export type LedgerStoreStatus = 'unknown' | 'loading' | 'ready' | 'error'

export interface LedgerState {
  organisationId: string | null
  status: LedgerStoreStatus
  events: LedgerEvent[]
  integrity: LedgerIntegrity | null
  error: string | null
  pendingLoad: Promise<void> | null
  pendingMutation: Promise<void> | null
  requestGeneration: number
  load: (organisationId: string) => Promise<void>
  settle: (runId: string, outcome: SimulationOutcome) => Promise<Settlement>
  adjust: (input: CreateAdjustmentInput) => Promise<void>
  reset: () => void
}

const EMPTY: Pick<
  LedgerState,
  | 'organisationId'
  | 'status'
  | 'events'
  | 'integrity'
  | 'error'
  | 'pendingLoad'
  | 'pendingMutation'
  | 'requestGeneration'
> = {
  organisationId: null,
  status: 'unknown',
  events: [],
  integrity: null,
  error: null,
  pendingLoad: null,
  pendingMutation: null,
  requestGeneration: 0,
}

async function fetchInto(
  organisationId: string,
  requestGeneration: number,
  set: (partial: Partial<LedgerState>) => void,
  get: () => LedgerState,
): Promise<void> {
  const isCurrent = () =>
    get().organisationId === organisationId && get().requestGeneration === requestGeneration

  try {
    const page = await listLedgerEvents(organisationId, { limit: 200 })
    if (!isCurrent()) return
    set({ status: 'ready', events: page.events, integrity: page.integrity, error: null })
  } catch (error) {
    if (!isCurrent()) return
    set({ status: 'error', error: getApiErrorMessage(error, 'The ledger could not be loaded') })
  }
}

function startFetch(
  organisationId: string,
  set: (partial: Partial<LedgerState>) => void,
  get: () => LedgerState,
  options: { trackPending?: boolean; showLoading?: boolean } = {},
): Promise<void> {
  const { trackPending = true, showLoading = true } = options
  const requestGeneration = get().requestGeneration + 1
  set({
    organisationId,
    ...(showLoading ? { status: 'loading' as const, error: null } : {}),
    pendingLoad: null,
    requestGeneration,
  })
  const loading = fetchInto(organisationId, requestGeneration, set, get).finally(() => {
    if (get().organisationId === organisationId && get().requestGeneration === requestGeneration) {
      set({ pendingLoad: null })
    }
  })

  if (trackPending) set({ pendingLoad: loading })
  return loading
}

function restoreAfterMutationFailure(
  organisationId: string,
  requestGeneration: number,
  previousStatus: LedgerStoreStatus,
  previousError: string | null,
  set: (partial: Partial<LedgerState>) => void,
  get: () => LedgerState,
): void {
  if (get().organisationId !== organisationId || get().requestGeneration !== requestGeneration) return
  const status =
    previousStatus === 'loading'
      ? get().events.length > 0 || get().integrity !== null
        ? 'ready'
        : 'unknown'
      : previousStatus
  set({ status, error: previousStatus === 'error' ? previousError : null, pendingLoad: null })
}

async function recoverAfterMutationFailure(
  organisationId: string,
  requestGeneration: number,
  previousStatus: LedgerStoreStatus,
  previousError: string | null,
  set: (partial: Partial<LedgerState>) => void,
  get: () => LedgerState,
): Promise<void> {
  restoreAfterMutationFailure(organisationId, requestGeneration, previousStatus, previousError, set, get)
  if (get().organisationId !== organisationId || get().requestGeneration !== requestGeneration) return
  await startFetch(organisationId, set, get, { trackPending: false, showLoading: false })
}

function canRefreshAfterMutation(
  organisationId: string,
  requestGeneration: number,
  get: () => LedgerState,
): boolean {
  const state = get()
  return (
    state.organisationId === organisationId &&
    (state.requestGeneration === requestGeneration || state.pendingMutation === null)
  )
}

async function refreshAfterMutation(
  organisationId: string,
  requestGeneration: number,
  set: (partial: Partial<LedgerState>) => void,
  get: () => LedgerState,
): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (!canRefreshAfterMutation(organisationId, requestGeneration, get)) return
    const pendingLoad = get().pendingLoad
    if (pendingLoad) await pendingLoad
    if (!canRefreshAfterMutation(organisationId, requestGeneration, get)) return
    const expectedGeneration = get().requestGeneration + 1
    await startFetch(organisationId, set, get, { trackPending: false, showLoading: false })
    if (get().requestGeneration === expectedGeneration) return
  }
}

export const useLedgerStore = create<LedgerState>()((set, get) => ({
  ...EMPTY,

  load: (organisationId) => {
    const state = get()
    if (state.pendingLoad && state.organisationId === organisationId) return state.pendingLoad
    if (state.pendingMutation && state.organisationId === organisationId) {
      return state.pendingMutation.then(async () => {
        if (get().organisationId !== organisationId) return
        const pendingLoad = get().pendingLoad
        if (pendingLoad) {
          await pendingLoad
          return
        }
        await startFetch(organisationId, set, get)
      })
    }
    return startFetch(organisationId, set, get)
  },

  settle: async (runId, outcome) => {
    for (;;) {
      const previousMutation = get().pendingMutation
      if (!previousMutation) break
      await previousMutation
    }
    const organisationId = requireOrganisationId(get().organisationId)
    const previousStatus = get().status
    const previousError = get().error
    const hadPendingLoad = get().pendingLoad !== null
    const requestGeneration = get().requestGeneration + 1
    let completeMutation!: () => void
    const mutationDone = new Promise<void>((resolve) => {
      completeMutation = resolve
    })
    set({ requestGeneration, pendingLoad: null, pendingMutation: mutationDone })
    let settlement: Settlement
    try {
      settlement = await settleSimulationRun(organisationId, runId, outcome)
      await refreshAfterMutation(organisationId, requestGeneration, set, get)
    } catch (error) {
      if (hadPendingLoad) {
        await recoverAfterMutationFailure(
          organisationId,
          requestGeneration,
          previousStatus,
          previousError,
          set,
          get,
        )
      } else {
        restoreAfterMutationFailure(organisationId, requestGeneration, previousStatus, previousError, set, get)
      }
      throw error
    } finally {
      completeMutation()
      if (get().pendingMutation === mutationDone) set({ pendingMutation: null })
    }
    // Re-read rather than splice: the appended events must be shown with the
    // server's own integrity verdict over the whole chain.
    return settlement
  },

  adjust: async (input) => {
    for (;;) {
      const previousMutation = get().pendingMutation
      if (!previousMutation) break
      await previousMutation
    }
    const organisationId = requireOrganisationId(get().organisationId)
    const previousStatus = get().status
    const previousError = get().error
    const hadPendingLoad = get().pendingLoad !== null
    const requestGeneration = get().requestGeneration + 1
    let completeMutation!: () => void
    const mutationDone = new Promise<void>((resolve) => {
      completeMutation = resolve
    })
    set({ requestGeneration, pendingLoad: null, pendingMutation: mutationDone })
    try {
      await createLedgerAdjustment(organisationId, input)
      await refreshAfterMutation(organisationId, requestGeneration, set, get)
    } catch (error) {
      if (hadPendingLoad) {
        await recoverAfterMutationFailure(
          organisationId,
          requestGeneration,
          previousStatus,
          previousError,
          set,
          get,
        )
      } else {
        restoreAfterMutationFailure(organisationId, requestGeneration, previousStatus, previousError, set, get)
      }
      throw error
    } finally {
      completeMutation()
      if (get().pendingMutation === mutationDone) set({ pendingMutation: null })
    }
  },

  reset: () => set((state) => ({ ...EMPTY, requestGeneration: state.requestGeneration + 1 })),
}))

useOrganisationStore.subscribe((state, previous) => {
  if (state.selectedId === previous.selectedId) return
  if (state.selectedId === useLedgerStore.getState().organisationId) return
  useLedgerStore.getState().reset()
})

useSessionStore.subscribe((state, previous) => {
  if (previous.status === 'authenticated' && state.status !== 'authenticated') {
    useLedgerStore.getState().reset()
  }
})
