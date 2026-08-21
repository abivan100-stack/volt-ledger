import { ApiError } from './errors'
import { send, type ResourceOptions } from './resource'

/**
 * Session restore and sign-out.
 *
 * `fetchSession` is deliberately forgiving about the two states that are normal
 * rather than exceptional — no session, and no API configured — so the
 * browser-only demo keeps working untouched. Everything else propagates.
 */

export interface SessionUser {
  id: string
  name: string
  email: string
  emailVerified: boolean
}

export interface SessionInfo {
  id: string
  /** ISO-8601 timestamp. */
  expiresAt: string
}

export interface Session {
  user: SessionUser
  session: SessionInfo
}

export type SessionRequestOptions = ResourceOptions

/** The signed-in user, or `null` when there is no usable session. */
export async function fetchSession(options: SessionRequestOptions = {}): Promise<Session | null> {
  try {
    return await send<Session>(options, '/api/v1/me')
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.code === 'API_NOT_CONFIGURED')) {
      return null
    }
    throw error
  }
}

/** Clears the session cookie. An already-expired session is treated as success. */
export async function signOut(options: SessionRequestOptions = {}): Promise<void> {
  try {
    await send<unknown>(options, '/api/auth/sign-out', { method: 'POST' })
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return
    throw error
  }
}

/**
 * Closes the signed-in account. There is no administrator who can do this for
 * anyone else, and it cannot be undone.
 *
 * Rejects with 409 `ACCOUNT_OWNS_ORGANISATIONS` while the account still owns an
 * organisation: an owner membership cannot be released, so the holder has to
 * transfer ownership or archive first.
 */
export async function closeAccount(options: SessionRequestOptions = {}): Promise<void> {
  await send<unknown>(options, '/api/v1/me', { method: 'DELETE' })
}
