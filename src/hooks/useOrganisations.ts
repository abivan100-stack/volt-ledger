import { useEffect } from 'react'
import { useOrganisationStore, type OrganisationState } from '../store/useOrganisationStore'
import { useSessionStore } from '../store/useSessionStore'

/**
 * Loads the signed-in user's organisations and returns the current state.
 *
 * The load is tied to the session rather than to mount: a component may render
 * while the session is still being restored, and asking for organisations before
 * there is a cookie only earns a 401.
 */
export function useOrganisations(): OrganisationState {
  const state = useOrganisationStore()
  const sessionStatus = useSessionStore((session) => session.status)

  useEffect(() => {
    if (sessionStatus !== 'authenticated') return
    if (useOrganisationStore.getState().status !== 'unknown') return
    void useOrganisationStore.getState().load()
  }, [sessionStatus])

  return state
}
