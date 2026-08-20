import { useEffect } from 'react'
import { useSessionStore, type SessionState } from '../store/useSessionStore'

/**
 * Restores the authenticated session once, on first mount, and returns the
 * current session state. Safe to call from several components: the store
 * collapses concurrent restores into one request and skips the call entirely
 * once the session is already known.
 */
export function useRestoreSession(): SessionState {
  const state = useSessionStore()

  useEffect(() => {
    if (useSessionStore.getState().status === 'unknown') {
      void useSessionStore.getState().restore()
    }
  }, [])

  return state
}
