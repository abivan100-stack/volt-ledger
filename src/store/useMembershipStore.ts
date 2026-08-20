import { create } from 'zustand'
import { ApiError } from '../api/errors'
import {
  listMemberships,
  removeMembership,
  transferOwnership,
  updateMembershipRole,
  type Membership,
} from '../api/memberships'
import type { AssignableRole } from '../lib/permissions'
import { useOrganisationStore } from './useOrganisationStore'
import { useSessionStore } from './useSessionStore'

/**
 * The member list of whichever organisation is currently selected.
 *
 * Only one organisation's members are held at a time, and `organisationId`
 * records whose they are — a list rendered against the wrong organisation would
 * be a privacy problem, not just a stale view.
 */

export type MembershipStatus = 'unknown' | 'loading' | 'ready' | 'error'

export interface MembershipState {
  organisationId: string | null
  status: MembershipStatus
  members: Membership[]
  error: string | null
  pendingLoad: Promise<void> | null
  load: (organisationId: string) => Promise<void>
  changeRole: (userId: string, role: AssignableRole) => Promise<Membership>
  remove: (userId: string) => Promise<void>
  /** Promotes a member to owner; the acting owner is demoted to admin. */
  handOverOwnership: (userId: string) => Promise<void>
  reset: () => void
}

const EMPTY: Pick<
  MembershipState,
  'organisationId' | 'status' | 'members' | 'error' | 'pendingLoad'
> = {
  organisationId: null,
  status: 'unknown',
  members: [],
  error: null,
  pendingLoad: null,
}

function messageFor(error: unknown): string {
  if (error instanceof ApiError) return error.message
  return 'The members could not be loaded'
}

/** Fails loudly rather than sending a mutation at an unknown organisation. */
function requireOrganisationId(organisationId: string | null): string {
  if (!organisationId) throw new Error('No organisation is selected')
  return organisationId
}

export const useMembershipStore = create<MembershipState>()((set, get) => ({
  ...EMPTY,

  load: (organisationId) => {
    const state = get()
    if (state.pendingLoad && state.organisationId === organisationId) return state.pendingLoad

    set({ organisationId, status: 'loading', error: null })
    const loading = listMemberships(organisationId)
      .then((members) => {
        // A slower request for a previously selected organisation must not
        // overwrite the list the user is now looking at.
        if (get().organisationId !== organisationId) return
        set({ status: 'ready', members, error: null })
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

  changeRole: async (userId, role) => {
    const organisationId = requireOrganisationId(get().organisationId)
    const updated = await updateMembershipRole(organisationId, userId, role)
    set((state) => ({
      members: state.members.map((member) => (member.userId === userId ? updated : member)),
    }))
    return updated
  },

  remove: async (userId) => {
    const organisationId = requireOrganisationId(get().organisationId)
    await removeMembership(organisationId, userId)
    set((state) => ({
      members: state.members.filter((member) => member.userId !== userId),
    }))
  },

  handOverOwnership: async (userId) => {
    const organisationId = requireOrganisationId(get().organisationId)
    const ownership = await transferOwnership(organisationId, userId)
    set((state) => ({
      members: state.members.map((member) => {
        if (member.userId === ownership.newOwner.userId) return ownership.newOwner
        if (member.userId === ownership.previousOwner.userId) return ownership.previousOwner
        return member
      }),
    }))
    // The acting owner is now an admin, so the organisation's own record of the
    // caller's role is stale. Reload it rather than guessing.
    await useOrganisationStore.getState().load()
  },

  reset: () => set({ ...EMPTY }),
}))

// Members belong to one organisation and one session; drop them when either changes.
useOrganisationStore.subscribe((state, previous) => {
  if (state.selectedId === previous.selectedId) return
  // A selection that merely resolved to the organisation these members already
  // belong to does not make them stale, so keep the list the user is looking at.
  if (state.selectedId === useMembershipStore.getState().organisationId) return
  useMembershipStore.getState().reset()
})

useSessionStore.subscribe((state, previous) => {
  if (previous.status === 'authenticated' && state.status !== 'authenticated') {
    useMembershipStore.getState().reset()
  }
})
