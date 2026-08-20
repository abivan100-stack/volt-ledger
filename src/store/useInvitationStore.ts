import { create } from 'zustand'
import { ApiError } from '../api/errors'
import {
  createInvitation,
  listInvitations,
  revokeInvitation,
  type CreateInvitationInput,
  type Invitation,
} from '../api/invitations'
import { useOrganisationStore } from './useOrganisationStore'
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

function messageFor(error: unknown): string {
  if (error instanceof ApiError) return error.message
  return 'The invitations could not be loaded'
}

function requireOrganisationId(organisationId: string | null): string {
  if (!organisationId) throw new Error('No organisation is selected')
  return organisationId
}

export const useInvitationStore = create<InvitationState>()((set, get) => ({
  ...EMPTY,

  load: (organisationId) => {
    const state = get()
    if (state.pendingLoad && state.organisationId === organisationId) return state.pendingLoad

    set({ organisationId, status: 'loading', error: null })
    const loading = listInvitations(organisationId)
      .then((invitations) => {
        if (get().organisationId !== organisationId) return
        set({ status: 'ready', invitations, error: null })
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

  invite: async (input) => {
    const organisationId = requireOrganisationId(get().organisationId)
    const created = await createInvitation(organisationId, input)
    set((state) => ({ invitations: [created, ...state.invitations] }))
    return created
  },

  revoke: async (invitationId) => {
    const organisationId = requireOrganisationId(get().organisationId)
    await revokeInvitation(organisationId, invitationId)
    // The record is retained for history, so mark it revoked rather than
    // dropping it from the list.
    set((state) => ({
      invitations: state.invitations.map((invitation) =>
        invitation.id === invitationId ? { ...invitation, status: 'revoked' } : invitation,
      ),
    }))
  },

  reset: () => set({ ...EMPTY }),
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
