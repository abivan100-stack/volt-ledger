import { create } from 'zustand'
import { getApiErrorMessage } from '../api/errors'
import {
  createInvitation,
  listInvitations,
  revokeInvitation,
  type CreateInvitationInput,
  type Invitation,
} from '../api/invitations'
import { useOrganisationStore } from './useOrganisationStore'
import { requireOrganisationId } from './organisationScope'
import { useSessionStore } from './useSessionStore'

/**
 * Invitations for whichever organisation is currently selected.
 *
 * Like the member list, this holds one organisation's invitations at a time and
 * records whose they are, so a slow response cannot repaint the list of an
 * organisation the user has since left.
 */

export type InvitationStoreStatus = 'unknown' | 'loading' | 'ready' | 'error'

export interface InvitationState {
  organisationId: string | null
  status: InvitationStoreStatus
  invitations: Invitation[]
  error: string | null
  pendingLoad: Promise<void> | null
  requestGeneration: number
  load: (organisationId: string) => Promise<void>
  invite: (input: CreateInvitationInput) => Promise<Invitation>
  revoke: (invitationId: string) => Promise<void>
  reset: () => void
}

const EMPTY: Pick<
  InvitationState,
  'organisationId' | 'status' | 'invitations' | 'error' | 'pendingLoad'
> = {
  organisationId: null,
  status: 'unknown',
  invitations: [],
  error: null,
  pendingLoad: null,
}

export const useInvitationStore = create<InvitationState>()((set, get) => ({
  ...EMPTY,
  requestGeneration: 0,

  load: (organisationId) => {
    const state = get()
    if (state.pendingLoad && state.organisationId === organisationId) return state.pendingLoad

    const requestGeneration =
      state.organisationId === organisationId ? state.requestGeneration : state.requestGeneration + 1
    const isCurrent = () =>
      get().organisationId === organisationId && get().requestGeneration === requestGeneration
    set({ organisationId, status: 'loading', error: null, requestGeneration })
    const loading = listInvitations(organisationId)
      .then((invitations) => {
        if (!isCurrent()) return
        set({ status: 'ready', invitations, error: null })
      })
      .catch((error: unknown) => {
        if (!isCurrent()) return
        set({ status: 'error', error: getApiErrorMessage(error, 'The invitations could not be loaded') })
      })
      .finally(() => {
        if (isCurrent()) set({ pendingLoad: null })
      })

    set({ pendingLoad: loading })
    return loading
  },

  invite: async (input) => {
    const organisationId = requireOrganisationId(get().organisationId)
    const requestGeneration = get().requestGeneration
    const created = await createInvitation(organisationId, input)
    if (get().organisationId !== organisationId || get().requestGeneration !== requestGeneration) return created
    set((state) => ({ invitations: [created, ...state.invitations] }))
    return created
  },

  revoke: async (invitationId) => {
    const organisationId = requireOrganisationId(get().organisationId)
    const requestGeneration = get().requestGeneration
    await revokeInvitation(organisationId, invitationId)
    if (get().organisationId !== organisationId || get().requestGeneration !== requestGeneration) return
    // The record is retained for history, so mark it revoked rather than
    // dropping it from the list.
    set((state) => ({
      invitations: state.invitations.map((invitation) =>
        invitation.id === invitationId ? { ...invitation, status: 'revoked' } : invitation,
      ),
    }))
  },

  reset: () => set((state) => ({ ...EMPTY, requestGeneration: state.requestGeneration + 1 })),
}))

useOrganisationStore.subscribe((state, previous) => {
  if (state.selectedId === previous.selectedId) return
  if (state.selectedId === useInvitationStore.getState().organisationId) return
  useInvitationStore.getState().reset()
})

useSessionStore.subscribe((state, previous) => {
  if (previous.status === 'authenticated' && state.status !== 'authenticated') {
    useInvitationStore.getState().reset()
  }
})
