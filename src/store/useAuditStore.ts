import { create } from 'zustand'
import { listAuditEvents, type AuditEvent } from '../api/audit'
import { ApiError } from '../api/errors'
import { useOrganisationStore } from './useOrganisationStore'
import { useSessionStore } from './useSessionStore'

/**
 * The organisation's audit stream, paged forwards by opaque cursor.
 *
 * `loadMore` appends rather than replaces, so following the cursor builds one
 * continuous history. Changing the action filter starts a fresh page — a filter
 * applied halfway down a cursor chain would produce a list that is neither the
 * old view nor the new one.
 */

export type AuditStoreStatus = 'unknown' | 'loading' | 'ready' | 'error'

export const AUDIT_PAGE_SIZE = 25

export interface AuditState {
  organisationId: string | null
  status: AuditStoreStatus
  events: AuditEvent[]
  nextCursor: string | null
  /** Exact action match, or `null` for the unfiltered stream. */
  action: string | null
  loadingMore: boolean
  error: string | null
  pendingLoad: Promise<void> | null
  load: (organisationId: string) => Promise<void>
  loadMore: () => Promise<void>
  setAction: (action: string | null) => Promise<void>
  reset: () => void
}

const EMPTY: Pick<
  AuditState,
  | 'organisationId'
  | 'status'
  | 'events'
  | 'nextCursor'
  | 'action'
  | 'loadingMore'
  | 'error'
  | 'pendingLoad'
> = {
  organisationId: null,
  status: 'unknown',
  events: [],
  nextCursor: null,
  action: null,
  loadingMore: false,
  error: null,
  pendingLoad: null,
}

function messageFor(error: unknown): string {
  if (error instanceof ApiError) return error.message
  return 'The audit history could not be loaded'
}

export const useAuditStore = create<AuditState>()((set, get) => ({
  ...EMPTY,

  load: (organisationId) => {
    const state = get()
    if (state.pendingLoad && state.organisationId === organisationId) return state.pendingLoad

    const action = state.organisationId === organisationId ? state.action : null
    set({ organisationId, action, status: 'loading', error: null })

    const loading = listAuditEvents(organisationId, {
      limit: AUDIT_PAGE_SIZE,
      ...(action ? { action } : {}),
    })
      .then((page) => {
        if (get().organisationId !== organisationId) return
        set({
          status: 'ready',
          events: page.events,
          nextCursor: page.nextCursor,
          error: null,
        })
      })
      .catch((error: unknown) => {
        if (get().organisationId !== organisationId) return
        set({ status: 'error', error: messageFor(error) })
      })
      .finally(() => {
        if (get().organisationId === organisationId) set({ pendingLoad: null })
      })

    set({ pendingLoad: loading })
    return loading
  },

  loadMore: async () => {
    const { organisationId, nextCursor, action, loadingMore } = get()
    if (!organisationId || !nextCursor || loadingMore) return

    set({ loadingMore: true, error: null })
    try {
      const page = await listAuditEvents(organisationId, {
        limit: AUDIT_PAGE_SIZE,
        cursor: nextCursor,
        ...(action ? { action } : {}),
      })
      // The cursor may have been abandoned while this was in flight.
      if (get().organisationId !== organisationId || get().nextCursor !== nextCursor) return
      set((state) => ({
        events: [...state.events, ...page.events],
        nextCursor: page.nextCursor,
      }))
    } catch (error) {
      if (get().organisationId !== organisationId) return
      set({ error: messageFor(error) })
    } finally {
      if (get().organisationId === organisationId) set({ loadingMore: false })
    }
  },

  setAction: async (action) => {
    const organisationId = get().organisationId
    if (get().action === action) return
    // Start a fresh page: an existing cursor belongs to the previous filter.
    set({ action, events: [], nextCursor: null, pendingLoad: null })
    if (!organisationId) return
    await get().load(organisationId)
  },

  reset: () => set({ ...EMPTY }),
}))

useOrganisationStore.subscribe((state, previous) => {
  if (state.selectedId === previous.selectedId) return
  if (state.selectedId === useAuditStore.getState().organisationId) return
  useAuditStore.getState().reset()
})

useSessionStore.subscribe((state, previous) => {
  if (previous.status === 'authenticated' && state.status !== 'authenticated') {
    useAuditStore.getState().reset()
  }
})
