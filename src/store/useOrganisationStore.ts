import { create } from 'zustand'
import { ApiError } from '../api/errors'
import {
  archiveOrganisation,
  createOrganisation,
  listArchivedOrganisations,
  listOrganisations,
  restoreOrganisation,
  type ArchivedOrganisation,
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
  /**
   * Archives the user can still undo. Separate from `organisations` because an
   * archived organisation is not one you can work in — mixing them would put
   * something in the selector that has no members, no runs, and no ledger to
   * read.
   */
  archived: ArchivedOrganisation[]
  archivedStatus: OrganisationStatus
  archivedError: string | null
  pendingArchivedLoad: Promise<void> | null
  /** Invalidates work started by the previous browser session. */
  requestGeneration: number
  load: () => Promise<void>
  loadArchived: () => Promise<void>
  select: (organisationId: string | null) => void
  /** The selected organisation, or `null`. */
  selected: () => Organisation | null
  create: (input: CreateOrganisationInput) => Promise<Organisation>
  archive: (organisationId: string) => Promise<void>
  restore: (organisationId: string) => Promise<Organisation>
  reset: () => void
}

const EMPTY: Pick<
  OrganisationState,
  | 'status'
  | 'organisations'
  | 'selectedId'
  | 'error'
  | 'pendingLoad'
  | 'archived'
  | 'archivedStatus'
  | 'archivedError'
  | 'pendingArchivedLoad'
> = {
  status: 'unknown',
  organisations: [],
  selectedId: null,
  error: null,
  pendingLoad: null,
  archived: [],
  archivedStatus: 'unknown',
  archivedError: null,
  pendingArchivedLoad: null,
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
  requestGeneration: 0,

  load: () => {
    const pending = get().pendingLoad
    if (pending) return pending

    const requestGeneration = get().requestGeneration
    const isCurrent = () => get().requestGeneration === requestGeneration
    set({ status: 'loading', error: null })
    const loading = listOrganisations()
      .then((organisations) => {
        if (!isCurrent()) return
        set({
          status: 'ready',
          organisations,
          selectedId: resolveSelection(organisations, get().selectedId),
          error: null,
        })
      })
      .catch((error: unknown) => {
        if (!isCurrent()) return
        set({ status: 'error', error: messageFor(error) })
      })
      .finally(() => {
        if (isCurrent()) set({ pendingLoad: null })
      })

    set({ pendingLoad: loading })
    return loading
  },

  loadArchived: () => {
    const pending = get().pendingArchivedLoad
    if (pending) return pending

    const requestGeneration = get().requestGeneration
    const isCurrent = () => get().requestGeneration === requestGeneration
    set({ archivedStatus: 'loading', archivedError: null })
    const loading = listArchivedOrganisations()
      .then((archived) => {
        if (!isCurrent()) return
        set({ archivedStatus: 'ready', archived, archivedError: null })
      })
      .catch((error: unknown) => {
        if (!isCurrent()) return
        set({
          archivedStatus: 'error',
          archivedError:
            error instanceof ApiError ? error.message : 'Your archives could not be loaded',
        })
      })
      .finally(() => {
        if (isCurrent()) set({ pendingArchivedLoad: null })
      })

    set({ pendingArchivedLoad: loading })
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
    const requestGeneration = get().requestGeneration
    const created = await createOrganisation(input)
    if (get().requestGeneration !== requestGeneration) return created
    set((state) => ({
      organisations: [...state.organisations, created],
      selectedId: created.id,
      status: 'ready',
    }))
    return created
  },

  archive: async (organisationId) => {
    const requestGeneration = get().requestGeneration
    await archiveOrganisation(organisationId)
    if (get().requestGeneration !== requestGeneration) return
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

    // The undo deadline is the server's to state, so the new archive is fetched
    // rather than guessed. Deliberately not awaited: the archive has already
    // succeeded, and a failed refresh must not report it as failed.
    if (get().archivedStatus !== 'unknown') void get().loadArchived()
  },

  restore: async (organisationId) => {
    const requestGeneration = get().requestGeneration
    const restored = await restoreOrganisation(organisationId)
    if (get().requestGeneration !== requestGeneration) return restored
    set((state) => ({
      organisations: [...state.organisations, restored],
      archived: state.archived.filter((entry) => entry.id !== organisationId),
      selectedId: restored.id,
      status: 'ready',
    }))
    return restored
  },

  reset: () => set((state) => ({ ...EMPTY, requestGeneration: state.requestGeneration + 1 })),
}))

// Organisation data belongs to a session. When one ends — signed out or expired —
// drop it rather than showing the next visitor a stale list.
useSessionStore.subscribe((state, previous) => {
  if (previous.status === 'authenticated' && state.status !== 'authenticated') {
    useOrganisationStore.getState().reset()
  }
})
