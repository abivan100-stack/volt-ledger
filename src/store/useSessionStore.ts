import { create } from 'zustand'
import { signInWithEmail, type EmailSignInInput } from '../api/auth'
import { getApiErrorMessage } from '../api/errors'
import { fetchSession, signOut as signOutRequest, type SessionUser } from '../api/session'
import { setUnauthenticatedHandler } from '../api/unauthenticated'

/**
 * Authenticated-session state, kept deliberately separate from `useEnergyStore`.
 *
 * The browser-only demo must keep working with no backend at all, so this store
 * never gates the simulation: with `VITE_API_BASE_URL` unset, `restore()` simply
 * settles on `anonymous` without a network call.
 */

export type SessionStatus =
  /** Nothing has been attempted yet. */
  | 'unknown'
  /** A restore request is in flight. */
  | 'restoring'
  /** A valid session exists. */
  | 'authenticated'
  /** No session — signed out, expired, or no API configured. */
  | 'anonymous'
  /** The session could not be determined; the visitor may still be signed in. */
  | 'error'

export interface SessionState {
  status: SessionStatus
  user: SessionUser | null
  /** ISO-8601 expiry of the current session, or `null`. */
  expiresAt: string | null
  /** Message from the last failed session request. */
  error: string | null
  /** True when a previously authenticated session was lost, not deliberately ended. */
  expired: boolean
  /**
   * The in-flight restore, held on the store rather than in a module variable so
   * that resetting the store also drops it. A stale handle would otherwise make
   * every later caller await a request that will never settle.
   */
  pendingRestore: Promise<void> | null
  /** Invalidates responses that began before a sign-in, sign-out, or expiry. */
  requestGeneration: number
  restore: () => Promise<void>
  /** Signs in with email and password, then loads the resulting session. */
  signIn: (input: EmailSignInInput) => Promise<void>
  signOut: () => Promise<void>
  /** Called when any API request reports a 401, so the UI can explain the drop-out. */
  expire: () => void
  dismissExpiryNotice: () => void
}

const SIGNED_OUT: Pick<SessionState, 'status' | 'user' | 'expiresAt'> = {
  status: 'anonymous',
  user: null,
  expiresAt: null,
}

export const useSessionStore = create<SessionState>()((set, get) => ({
  status: 'unknown',
  user: null,
  expiresAt: null,
  error: null,
  expired: false,
  pendingRestore: null,
  requestGeneration: 0,

  restore: () => {
    // Shared across concurrent callers so a burst of mounts issues one request.
    const pending = get().pendingRestore
    if (pending) return pending

    const requestGeneration = get().requestGeneration
    const isCurrent = () => get().requestGeneration === requestGeneration
    set({ status: 'restoring', error: null })
    const restoring = fetchSession()
      .then((session) => {
        if (!isCurrent()) return
        if (session) {
          set({
            status: 'authenticated',
            user: session.user,
            expiresAt: session.session.expiresAt,
            error: null,
            expired: false,
          })
          return
        }
        set({ ...SIGNED_OUT, error: null })
      })
      .catch((error: unknown) => {
        if (!isCurrent()) return
        // A failed request is not proof of being signed out — say so, and let the
        // visitor retry rather than tearing down state we cannot confirm is stale.
        set({ status: 'error', user: null, expiresAt: null, error: getApiErrorMessage(error, 'The session could not be restored') })
      })
      .finally(() => {
        if (isCurrent()) set({ pendingRestore: null })
      })

    set({ pendingRestore: restoring })
    return restoring
  },

  signIn: async (input) => {
    // Deliberately not caught: a bad password or an unverified address belongs
    // next to the sign-in form, not in the store's global error slot.
    await signInWithEmail(input)
    // The cookie is set but its user is not, so read the session back rather
    // than inventing state from the credentials that were submitted. Any restore
    // already in flight predates this sign-in, so it cannot answer for it.
    set((state) => ({ pendingRestore: null, requestGeneration: state.requestGeneration + 1 }))
    await get().restore()
  },

  signOut: async () => {
    try {
      await signOutRequest()
      set((state) => ({
        ...SIGNED_OUT,
        error: null,
        expired: false,
        pendingRestore: null,
        requestGeneration: state.requestGeneration + 1,
      }))
    } catch (error) {
      // Sign-out could not be confirmed, so the cookie may still be live.
      set((state) => ({
        error: getApiErrorMessage(error, 'The session could not be restored'),
        pendingRestore: null,
        requestGeneration: state.requestGeneration + 1,
      }))
    }
  },

  expire: () => {
    const wasAuthenticated = get().status === 'authenticated'
    if (!wasAuthenticated) return
    set((state) => ({
      ...SIGNED_OUT,
      expired: true,
      pendingRestore: null,
      requestGeneration: state.requestGeneration + 1,
    }))
  },

  dismissExpiryNotice: () => set({ expired: false }),
}))

// Any 401 from any route means the cookie is gone; drop to signed-out once,
// centrally, instead of asking every caller to remember.
setUnauthenticatedHandler(() => useSessionStore.getState().expire())
