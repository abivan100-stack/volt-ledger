import { describe, it, expect, vi } from 'vitest'
import { createApiClient, type FetchLike } from '../client'
import { ApiError } from '../errors'

const BASE = 'http://localhost:4000'

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  })
}

function clientWith(response: Response | Error) {
  const fetchImpl = vi.fn<FetchLike>(async () => {
    if (response instanceof Error) throw response
    return response
  })
  const calls = () => fetchImpl.mock.calls[0]
  return { client: createApiClient({ baseUrl: BASE, fetchImpl }), fetchImpl, calls }
}

/** `.catch` widens to `unknown`; every rejection under test is an ApiError. */
async function rejection(promise: Promise<unknown>): Promise<ApiError> {
  return promise.then(
    () => {
      throw new Error('Expected the request to reject')
    },
    (error: unknown) => error as ApiError,
  )
}

describe('createApiClient request', () => {
  it('prefixes the base URL and sends cookie credentials', async () => {
    const { client, calls } = clientWith(jsonResponse({ ok: true }))
    await client.request('/api/v1/me')

    const [url, init] = calls()
    expect(url).toBe('http://localhost:4000/api/v1/me')
    expect(init.credentials).toBe('include')
    expect(init.method).toBe('GET')
  })

  it('requests JSON explicitly', async () => {
    const { client, calls } = clientWith(jsonResponse({ ok: true }))
    await client.request('/api/v1/me')

    const headers = new Headers(calls()[1].headers)
    expect(headers.get('accept')).toBe('application/json')
  })

  it('sends no body or content-type on a GET', async () => {
    const { client, calls } = clientWith(jsonResponse({ ok: true }))
    await client.request('/api/v1/me')

    const init = calls()[1]
    expect(init.body).toBeUndefined()
    expect(new Headers(init.headers).get('content-type')).toBeNull()
  })

  it('serialises a JSON body and sets content-type', async () => {
    const { client, calls } = clientWith(jsonResponse({ ok: true }, { status: 201 }))
    await client.request('/api/v1/organisations', {
      method: 'POST',
      body: { name: 'Nolambur', slug: 'nolambur' },
    })

    const init = calls()[1]
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{"name":"Nolambur","slug":"nolambur"}')
    expect(new Headers(init.headers).get('content-type')).toBe('application/json')
  })

  it('appends defined query parameters and skips undefined ones', async () => {
    const { client, calls } = clientWith(jsonResponse({ ok: true }))
    await client.request('/api/v1/organisations/abc/audit-events', {
      query: { action: 'organisation.created', cursor: undefined, limit: 25 },
    })

    const url = calls()[0]
    expect(url).toBe(
      'http://localhost:4000/api/v1/organisations/abc/audit-events?action=organisation.created&limit=25',
    )
  })

  it('returns the parsed JSON payload', async () => {
    const { client } = clientWith(jsonResponse({ organisations: [{ id: 'a' }] }))
    const result = await client.request<{ organisations: { id: string }[] }>('/api/v1/organisations')
    expect(result.organisations).toEqual([{ id: 'a' }])
  })

  it('resolves to undefined for a 204 response', async () => {
    const { client } = clientWith(new Response(null, { status: 204 }))
    await expect(client.request('/api/v1/organisations/abc/memberships/u1', { method: 'DELETE' }))
      .resolves.toBeUndefined()
  })

  it('maps the server error envelope onto ApiError', async () => {
    const { client } = clientWith(
      jsonResponse(
        {
          error: 'Invalid organisation input',
          code: 'INVALID_REQUEST',
          issues: [{ path: 'slug', message: 'Invalid' }],
        },
        { status: 400 },
      ),
    )

    const error = await rejection(client.request('/api/v1/organisations', { method: 'POST', body: {} }))
    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(400)
    expect(error.code).toBe('INVALID_REQUEST')
    expect(error.message).toBe('Invalid organisation input')
    expect(error.issues).toEqual([{ path: 'slug', message: 'Invalid' }])
  })

  it('falls back to a generic code when the error body is not the expected envelope', async () => {
    const { client } = clientWith(new Response('<html>502</html>', { status: 502 }))
    const error = await rejection(client.request('/api/v1/me'))
    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(502)
    expect(error.code).toBe('UNEXPECTED_RESPONSE')
  })

  it('reads Retry-After seconds on a 429', async () => {
    const { client } = clientWith(
      jsonResponse(
        { error: 'Daily simulation quota exhausted', code: 'SIMULATION_QUOTA_EXHAUSTED' },
        { status: 429, headers: { 'content-type': 'application/json', 'retry-after': '3600' } },
      ),
    )

    const error = await rejection(
      client.request('/api/v1/organisations/abc/simulations', { method: 'POST', body: {} }),
    )
    expect(error.status).toBe(429)
    expect(error.retryAfterSeconds).toBe(3600)
  })

  it('leaves retryAfterSeconds null when Retry-After is not a number', async () => {
    const { client } = clientWith(
      jsonResponse({ error: 'Too many requests', code: 'RATE_LIMITED' }, {
        status: 429,
        headers: { 'content-type': 'application/json', 'retry-after': 'Wed, 21 Oct 2026 07:28:00 GMT' },
      }),
    )
    const error = await rejection(client.request('/api/v1/me'))
    expect(error.retryAfterSeconds).toBeNull()
  })

  it('turns a transport failure into a NETWORK_ERROR ApiError', async () => {
    const { client } = clientWith(new TypeError('Failed to fetch'))
    const error = await rejection(client.request('/api/v1/me'))
    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(0)
    expect(error.code).toBe('NETWORK_ERROR')
  })

  it('rethrows an abort so callers can ignore cancelled requests', async () => {
    const abortError = new DOMException('The operation was aborted.', 'AbortError')
    const { client } = clientWith(abortError)
    const error = await client.request('/api/v1/me').catch((caught: unknown) => caught)
    expect(error).toBe(abortError)
    expect(error).not.toBeInstanceOf(ApiError)
  })

  it('forwards an abort signal to fetch', async () => {
    const { client, calls } = clientWith(jsonResponse({ ok: true }))
    const controller = new AbortController()
    await client.request('/api/v1/me', { signal: controller.signal })
    expect(calls()[1].signal).toBe(controller.signal)
  })

  it('rejects a path that is not absolute', async () => {
    const { client } = clientWith(jsonResponse({ ok: true }))
    await expect(client.request('api/v1/me')).rejects.toThrow(/must start with/)
  })
})
