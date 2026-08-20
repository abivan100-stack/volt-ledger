import { ApiError } from './errors'

/**
 * The Volt API runs on its own origin (`API_HOST`/`API_PORT`) while the client is
 * served by Vite, so requests must be absolute. `VITE_API_BASE_URL` is the only
 * server address the browser bundle ever learns; MongoDB, Better Auth, and Resend
 * credentials stay in `server/.env`.
 *
 * Leaving the variable unset is legitimate: the browser-only demo needs no API.
 */

/**
 * Normalises a raw `VITE_API_BASE_URL` value.
 *
 * Returns `null` when unset or blank (demo-only build). Throws when a value is
 * present but unusable, so a deployment typo fails loudly instead of silently
 * sending requests nowhere.
 */
export function resolveApiBaseUrl(raw: string | undefined): string | null {
  const trimmed = raw?.trim()
  if (!trimmed) return null

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new Error(`VITE_API_BASE_URL is not a valid URL: ${trimmed}`)
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`VITE_API_BASE_URL must use http or https: ${trimmed}`)
  }

  return trimmed.replace(/\/+$/, '')
}

/** The configured API base URL, or `null` when the build is demo-only. */
export function apiBaseUrl(): string | null {
  return resolveApiBaseUrl(import.meta.env.VITE_API_BASE_URL)
}

/** Whether authenticated features can be reached at all in this build. */
export function isApiConfigured(): boolean {
  return apiBaseUrl() !== null
}

/** The API base URL, or an `API_NOT_CONFIGURED` error callers can degrade on. */
export function requireApiBaseUrl(): string {
  const baseUrl = apiBaseUrl()
  if (baseUrl === null) {
    throw new ApiError({
      message: 'VITE_API_BASE_URL is not configured',
      status: 0,
      code: 'API_NOT_CONFIGURED',
    })
  }
  return baseUrl
}
