import { apiRequest, type ApiClient } from './client'
import { ApiError } from './errors'

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

export interface SessionRequestOptions {
  /** Overrides the shared client; used by tests and by alternate origins. */
  client?: ApiClient
  signal?: AbortSignal
}

function request<T>(options: SessionRequestOptions, path: string, init: Parameters<ApiClient['request']>[1]): Promise<T> {
  return options.client ? options.client.request<T>(path, init) : apiRequest<T>(path, init)
}

/** The signed-in user, or `null` when there is no usable session. */
export async function fetchSession(options: SessionRequestOptions = {}): Promise<Session | null> {
  try {
    return await request<Session>(options, '/api/v1/me', { signal: options.signal })
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
    await request<unknown>(options, '/api/auth/sign-out', { method: 'POST' })
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return
    throw error
  }
}
