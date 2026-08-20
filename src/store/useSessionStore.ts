import { create } from 'zustand'
import { signInWithEmail, type EmailSignInInput } from '../api/auth'
import { ApiError } from '../api/errors'
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
  restore: () => Promise<void>
  /** Signs in with email and password, then loads the resulting session. */
  signIn: (input: EmailSignInInput) => Promise<void>
  signOut: () => Promise<void>
  /** Called when any API request reports a 401, so the UI can explain the drop-out. */
  expire: () => void
  dismissExpiryNotice: () => void
}

const SIGNED_OUT = {
  status: 'anonymous',
  user: null,
  expiresAt: null,
} as const

function messageFor(error: unknown): string {
  if (error instanceof ApiError) return error.message
  return 'The session could not be restored'
}

/** Shared across concurrent callers so a burst of mounts issues one request. */
let inFlightRestore: Promise<void> | null = null

export const useSessionStore = create<SessionState>()((set, get) => ({
  status: 'unknown',
  user: null,
  expiresAt: null,
  error: null,
  expired: false,

  restore: () => {
    if (inFlightRestore) return inFlightRestore

    set({ status: 'restoring', error: null })
    inFlightRestore = fetchSession()
      .then((session) => {
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
        // A failed request is not proof of being signed out — say so, and let the
        // visitor retry rather than tearing down state we cannot confirm is stale.
        set({ status: 'error', user: null, expiresAt: null, error: messageFor(error) })
      })
      .finally(() => {
        inFlightRestore = null
      })

    return inFlightRestore
  },

  signIn: async (input) => {
    // Deliberately not caught: a bad password or an unverified address belongs
    // next to the sign-in form, not in the store's global error slot.
    await signInWithEmail(input)
    // The cookie is set but its user is not, so read the session back rather
    // than inventing state from the credentials that were submitted.
    inFlightRestore = null
    await get().restore()
  },

  signOut: async () => {
    try {
      await signOutRequest()
      set({ ...SIGNED_OUT, error: null, expired: false })
    } catch (error) {
      // Sign-out could not be confirmed, so the cookie may still be live.
      set({ error: messageFor(error) })
    }
  },

  expire: () => {
    const wasAuthenticated = get().status === 'authenticated'
    set({ ...SIGNED_OUT, expired: wasAuthenticated })
  },

  dismissExpiryNotice: () => set({ expired: false }),
}))

// Any 401 from any route means the cookie is gone; drop to signed-out once,
// centrally, instead of asking every caller to remember.
setUnauthenticatedHandler(() => useSessionStore.getState().expire())
