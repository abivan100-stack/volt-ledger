import { create } from 'zustand'
import { ApiError } from '../api/errors'
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
  load: (organisationId: string) => Promise<void>
  settle: (runId: string, outcome: SimulationOutcome) => Promise<Settlement>
  adjust: (input: CreateAdjustmentInput) => Promise<void>
  reset: () => void
}

const EMPTY: Pick<
  LedgerState,
  'organisationId' | 'status' | 'events' | 'integrity' | 'error' | 'pendingLoad'
> = {
  organisationId: null,
  status: 'unknown',
  events: [],
  integrity: null,
  error: null,
  pendingLoad: null,
}

function messageFor(error: unknown): string {
  if (error instanceof ApiError) return error.message
  return 'The ledger could not be loaded'
}

function requireOrganisationId(organisationId: string | null): string {
  if (!organisationId) throw new Error('No organisation is selected')
  return organisationId
}

async function fetchInto(
  organisationId: string,
  set: (partial: Partial<LedgerState>) => void,
  get: () => LedgerState,
): Promise<void> {
  try {
    const page = await listLedgerEvents(organisationId, { limit: 200 })
    if (get().organisationId !== organisationId) return
    set({ status: 'ready', events: page.events, integrity: page.integrity, error: null })
  } catch (error) {
    if (get().organisationId !== organisationId) return
    set({ status: 'error', error: messageFor(error) })
  }
}

export const useLedgerStore = create<LedgerState>()((set, get) => ({
  ...EMPTY,

  load: (organisationId) => {
    const state = get()
    if (state.pendingLoad && state.organisationId === organisationId) return state.pendingLoad

    set({ organisationId, status: 'loading', error: null })
    const loading = fetchInto(organisationId, set, get).finally(() => {
      if (get().organisationId === organisationId) set({ pendingLoad: null })
    })

    set({ pendingLoad: loading })
    return loading
  },

  settle: async (runId, outcome) => {
    const organisationId = requireOrganisationId(get().organisationId)
    const settlement = await settleSimulationRun(organisationId, runId, outcome)
    // Re-read rather than splice: the appended events must be shown with the
    // server's own integrity verdict over the whole chain.
    await fetchInto(organisationId, set, get)
    return settlement
  },

  adjust: async (input) => {
    const organisationId = requireOrganisationId(get().organisationId)
    await createLedgerAdjustment(organisationId, input)
    await fetchInto(organisationId, set, get)
  },

  reset: () => set({ ...EMPTY }),
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
