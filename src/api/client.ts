import { requireApiBaseUrl } from './config'
import { ApiError, type ApiErrorIssue } from './errors'

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

interface ErrorEnvelope {
  error: string
  code: string
  issues?: ApiErrorIssue[]
}

function isErrorEnvelope(value: unknown): value is ErrorEnvelope {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return typeof candidate.error === 'string' && typeof candidate.code === 'string'
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
  // The header may also hold an HTTP date; only a plain second count is useful here.
  return Number.isFinite(seconds) ? seconds : null
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

async function toApiError(response: Response): Promise<ApiError> {
  const payload = await readJson(response)
  const retryAfterSeconds = parseRetryAfter(response)

  if (isErrorEnvelope(payload)) {
    return new ApiError({
      message: payload.error,
      status: response.status,
      code: payload.code,
      issues: payload.issues,
      retryAfterSeconds,
    })
  }

  return new ApiError({
    message: `Request failed with status ${response.status}`,
    status: response.status,
    code: 'UNEXPECTED_RESPONSE',
    retryAfterSeconds,
  })
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

      let response: Response
      try {
        response = await fetchImpl(url, {
          method,
          headers,
          credentials: 'include',
          body: hasBody ? JSON.stringify(options.body) : undefined,
          signal: options.signal,
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

      if (!response.ok) throw await toApiError(response)

      return (await readJson(response)) as T
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
