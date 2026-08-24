import { requireApiBaseUrl } from './config'
import { ApiError, type ApiErrorIssue } from './errors'
import { notifyUnauthenticated } from './unauthenticated'

/**
 * Thin typed wrapper over `fetch` for the Volt REST API.
 *
 * Two things every call needs and none may forget: an absolute URL (the API is on
 * a different origin than the client) and `credentials: 'include'` (sessions are
 * cookie-based). Cross-origin requests carry an `Origin` header automatically,
 * which satisfies the API's CSRF check on state-changing routes.
 */

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>

export type ApiRequestMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'

export interface ApiRequestOptions {
  method?: ApiRequestMethod
  /** Serialised as JSON. Omitted entirely on GET-style calls. */
  body?: unknown
  /** Appended as a query string; `undefined` and `null` entries are dropped. */
  query?: Record<string, string | number | boolean | undefined | null>
  signal?: AbortSignal
}

export interface ApiClient {
  request: <T>(path: string, options?: ApiRequestOptions) => Promise<T>
}

export interface ApiClientConfig {
  baseUrl: string
  fetchImpl?: FetchLike
}

interface ParsedErrorBody {
  message: string
  code: string | null
  issues?: ApiErrorIssue[]
}

/**
 * Two envelopes reach this client: Volt's own `{ error, code, issues? }` on
 * `/api/v1`, and Better Auth's `{ message, code? }` on `/api/auth`. Read either
 * so a sign-in failure shows its real reason instead of a status number.
 */
function isValidIssues(value: unknown): value is ApiErrorIssue[] {
  if (!Array.isArray(value)) return false
  return value.every(
    (item) =>
      typeof item === 'object' &&
      item !== null &&
      typeof (item as Record<string, unknown>).path === 'string' &&
      typeof (item as Record<string, unknown>).message === 'string',
  )
}

function parseErrorBody(value: unknown): ParsedErrorBody | null {
  if (typeof value !== 'object' || value === null) return null
  const candidate = value as Record<string, unknown>

  if (typeof candidate.error === 'string') {
    return {
      message: candidate.error,
      code: typeof candidate.code === 'string' ? candidate.code : null,
      issues: isValidIssues(candidate.issues) ? (candidate.issues as ApiErrorIssue[]) : undefined,
    }
  }

  if (typeof candidate.message === 'string') {
    return {
      message: candidate.message,
      code: typeof candidate.code === 'string' ? candidate.code : null,
    }
  }

  return null
}

function buildUrl(baseUrl: string, path: string, query: ApiRequestOptions['query']): string {
  if (!path.startsWith('/')) {
    throw new Error(`API request path must start with "/": ${path}`)
  }

  const url = `${baseUrl}${path}`
  if (!query) return url

  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue
    search.append(key, String(value))
  }

  const serialised = search.toString()
  return serialised ? `${url}?${serialised}` : url
}

function parseRetryAfter(response: Response): number | null {
  const header = response.headers.get('retry-after')
  if (header === null) return null
  const seconds = Number(header)
  if (Number.isFinite(seconds)) return seconds
  const date = Date.parse(header)
  if (Number.isFinite(date)) {
    return Math.max(0, Math.ceil((date - Date.now()) / 1000))
  }
  return null
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text()
  if (text.length === 0) return undefined
  try {
    return JSON.parse(text) as unknown
  } catch {
    return undefined
  }
}

async function readJsonOrThrow(response: Response): Promise<unknown> {
  const text = await response.text()
  if (text.length === 0) return undefined
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new ApiError({
      message: 'Invalid JSON response from Volt API',
      status: response.status,
      code: 'UNEXPECTED_RESPONSE',
    })
  }
}

async function toApiError(response: Response): Promise<ApiError> {
  const payload = await readJson(response)
  const retryAfterSeconds = parseRetryAfter(response)
  const parsed = parseErrorBody(payload)

  return new ApiError({
    message: parsed?.message ?? `Request failed with status ${response.status}`,
    status: response.status,
    code: parsed?.code ?? 'UNEXPECTED_RESPONSE',
    issues: parsed?.issues,
    retryAfterSeconds,
  })
}

const DEFAULT_TIMEOUT_MS = 15_000

function shouldNotifyUnauthenticated(path: string): boolean {
  return !path.startsWith('/api/auth/')
}

export function createApiClient(config: ApiClientConfig): ApiClient {
  const fetchImpl = config.fetchImpl ?? ((input, init) => fetch(input, init))

  return {
    async request<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
      const url = buildUrl(config.baseUrl, path, options.query)
      const method = options.method ?? 'GET'
      const hasBody = options.body !== undefined

      const headers: Record<string, string> = { accept: 'application/json' }
      if (hasBody) headers['content-type'] = 'application/json'

      const timeoutSignal =
        typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(DEFAULT_TIMEOUT_MS) : undefined
      const signal =
        timeoutSignal && options.signal
          ? typeof AbortSignal.any === 'function'
            ? AbortSignal.any([timeoutSignal, options.signal])
            : options.signal
          : (timeoutSignal ?? options.signal)

      let response: Response
      try {
        response = await fetchImpl(url, {
          method,
          headers,
          credentials: 'include',
          body: hasBody ? JSON.stringify(options.body) : undefined,
          signal,
        })
      } catch (error) {
        // An aborted request is the caller's own doing, not a transport failure.
        if (error instanceof Error && error.name === 'AbortError') throw error
        throw new ApiError({
          message: 'Could not reach the Volt API',
          status: 0,
          code: 'NETWORK_ERROR',
        })
      }

      if (!response.ok) {
        // Tell the session layer before the caller sees the rejection, so the UI
        // is already signed out by the time it renders the failure.
        if (response.status === 401 && shouldNotifyUnauthenticated(path)) notifyUnauthenticated()
        throw await toApiError(response)
      }

      return (await readJsonOrThrow(response)) as T
    },
  }
}

let defaultClient: ApiClient | undefined

/**
 * Issues a request through the shared environment-configured client. Throws
 * `API_NOT_CONFIGURED` when `VITE_API_BASE_URL` is unset.
 */
export function apiRequest<T>(path: string, options?: ApiRequestOptions): Promise<T> {
  defaultClient ??= createApiClient({ baseUrl: requireApiBaseUrl() })
  return defaultClient.request<T>(path, options)
}
