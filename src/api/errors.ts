/**
 * Every Volt API failure — validation, authorization, quota, transport — is surfaced
 * as one `ApiError`. The server uses a single response envelope
 * (`{ error, code, issues? }`) across all `/api/v1` routes, so one error type is
 * enough for the whole surface.
 */

export interface ApiErrorIssue {
  /** Dot-joined path of the offending request field, e.g. `households.0.pvKw`. */
  path: string
  message: string
}

export interface ApiErrorInit {
  message: string
  /** HTTP status, or `0` when the request never reached the server. */
  status: number
  /** Server-supplied `code`, or a client-side code such as `NETWORK_ERROR`. */
  code: string
  issues?: readonly ApiErrorIssue[]
  /** Parsed `Retry-After` seconds; `null` unless the server sent a numeric value. */
  retryAfterSeconds?: number | null
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly issues: readonly ApiErrorIssue[]
  readonly retryAfterSeconds: number | null

  constructor(init: ApiErrorInit) {
    super(init.message)
    this.name = 'ApiError'
    this.status = init.status
    this.code = init.code
    this.issues = init.issues ?? []
    this.retryAfterSeconds = init.retryAfterSeconds ?? null
  }
}

/** Returns the server message when available, otherwise a stable UI fallback. */
export function getApiErrorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback
}

/** The session is missing or expired — the caller should return to a signed-out state. */
export function isUnauthenticatedError(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 401
}

/** The user is signed in but their membership or role does not permit the action. */
export function isForbiddenError(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 403
}

/** A global rate limit or a daily simulation quota was exhausted. */
export function isRateLimitedError(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 429
}

/** The request never reached the server, so retrying is meaningful. */
export function isNetworkError(error: unknown): error is ApiError {
  return error instanceof ApiError && error.code === 'NETWORK_ERROR'
}
