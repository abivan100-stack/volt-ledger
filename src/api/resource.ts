import { apiRequest, type ApiClient, type ApiRequestOptions } from './client'

/**
 * Shared plumbing for the typed resource modules (`session.ts`, `organisations.ts`, …).
 *
 * Each resource function takes the same optional pair: a `client` override, which
 * lets tests supply a stub without touching globals, and a `signal` so any call
 * can be cancelled when a component unmounts.
 */

export interface ResourceOptions {
  /** Overrides the shared environment-configured client. */
  client?: ApiClient
  signal?: AbortSignal
}

export function send<T>(
  options: ResourceOptions,
  path: string,
  init: Omit<ApiRequestOptions, 'signal'> = {},
): Promise<T> {
  const request = options.client
    ? <R,>(p: string, i: ApiRequestOptions) => options.client!.request<R>(p, i)
    : apiRequest
  return request<T>(path, { ...init, signal: options.signal })
}
