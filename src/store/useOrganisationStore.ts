import { create } from 'zustand'
import { ApiError } from '../api/errors'
import {
  archiveOrganisation,
  createOrganisation,
  listOrganisations,
  type CreateOrganisationInput,
  type Organisation,
} from '../api/organisations'
import { useSessionStore } from './useSessionStore'

/**
 * The signed-in user's organisations and which one they are currently working in.
 *
 * List failures are held on the store so the selector can offer a retry, while
 * `create` and `archive` reject to their caller — a form or confirmation dialog
 * needs the error next to the control that caused it, not in a global slot.
 */

export type OrganisationStatus = 'unknown' | 'loading' | 'ready' | 'error'

export interface OrganisationState {
  status: OrganisationStatus
  organisations: Organisation[]
  selectedId: string | null
  error: string | null
  /**
   * The in-flight load, held on the store rather than in a module variable so
   * that resetting the store also drops it.
   */
  pendingLoad: Promise<void> | null
  load: () => Promise<void>
  select: (organisationId: string | null) => void
  /** The selected organisation, or `null`. */
  selected: () => Organisation | null
  create: (input: CreateOrganisationInput) => Promise<Organisation>
  archive: (organisationId: string) => Promise<void>
  reset: () => void
}

const EMPTY: Pick<
  OrganisationState,
  'status' | 'organisations' | 'selectedId' | 'error' | 'pendingLoad'
> = {
  status: 'unknown',
  organisations: [],
  selectedId: null,
  error: null,
  pendingLoad: null,
}

function messageFor(error: unknown): string {
  if (error instanceof ApiError) return error.message
  return 'The organisations could not be loaded'
}

/**
 * Keeps a selection pointing at something real: an existing choice survives a
 * refresh, and anything else falls back to the first organisation.
 */
function resolveSelection(organisations: Organisation[], current: string | null): string | null {
  if (current && organisations.some((organisation) => organisation.id === current)) return current
  return organisations[0]?.id ?? null
}

export const useOrganisationStore = create<OrganisationState>()((set, get) => ({
  ...EMPTY,

  load: () => {
    const pending = get().pendingLoad
    if (pending) return pending

    set({ status: 'loading', error: null })
    const loading = listOrganisations()
      .then((organisations) => {
        set({
          status: 'ready',
          organisations,
          selectedId: resolveSelection(organisations, get().selectedId),
          error: null,
        })
      })
      .catch((error: unknown) => {
        set({ status: 'error', error: messageFor(error) })
      })
      .finally(() => {
        set({ pendingLoad: null })
      })

    set({ pendingLoad: loading })
    return loading
  },

  select: (organisationId) => {
    if (organisationId === null) {
      set({ selectedId: null })
      return
    }
    // Selecting something we have never seen would leave the UI pointing at an
    // organisation it cannot describe, so ignore it.
    if (!get().organisations.some((organisation) => organisation.id === organisationId)) return
    set({ selectedId: organisationId })
  },

  selected: () => {
    const { organisations, selectedId } = get()
    if (!selectedId) return null
    return organisations.find((organisation) => organisation.id === selectedId) ?? null
  },

  create: async (input) => {
    const created = await createOrganisation(input)
    set((state) => ({
      organisations: [...state.organisations, created],
      selectedId: created.id,
      status: 'ready',
    }))
    return created
  },

  archive: async (organisationId) => {
    await archiveOrganisation(organisationId)
    set((state) => {
      const organisations = state.organisations.filter(
        (organisation) => organisation.id !== organisationId,
      )
      const selectedId =
        state.selectedId === organisationId
          ? resolveSelection(organisations, null)
          : state.selectedId
      return { organisations, selectedId }
    })
  },

  reset: () => set({ ...EMPTY }),
}))

// Organisation data belongs to a session. When one ends — signed out or expired —
// drop it rather than showing the next visitor a stale list.
useSessionStore.subscribe((state, previous) => {
  if (previous.status === 'authenticated' && state.status !== 'authenticated') {
    useOrganisationStore.getState().reset()
  }
})
