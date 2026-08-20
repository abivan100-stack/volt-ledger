import { describe, it, expect, vi } from 'vitest'
import { fetchSession, signOut } from '../session'
import { ApiError } from '../errors'
import type { ApiClient } from '../client'

const SESSION_PAYLOAD = {
  user: { id: 'user-1', name: 'Asha', email: 'asha@example.com', emailVerified: true },
  session: { id: 'session-1', expiresAt: '2026-09-01T00:00:00.000Z' },
}

function stubClient(handler: (path: string, options?: unknown) => Promise<unknown>): {
  client: ApiClient
  request: ReturnType<typeof vi.fn>
} {
  const request = vi.fn(handler)
  return { client: { request } as unknown as ApiClient, request }
}

describe('fetchSession', () => {
  it('reads the current session from /api/v1/me', async () => {
    const { client, request } = stubClient(async () => SESSION_PAYLOAD)
    const session = await fetchSession({ client })

    expect(request).toHaveBeenCalledWith('/api/v1/me', { signal: undefined })
    expect(session).toEqual(SESSION_PAYLOAD)
  })

  it('resolves to null when the visitor has no session', async () => {
    const { client } = stubClient(async () => {
      throw new ApiError({ message: 'Authentication required', status: 401, code: 'UNAUTHENTICATED' })
    })
    await expect(fetchSession({ client })).resolves.toBeNull()
  })

  it('resolves to null when the API is not configured, leaving demo mode intact', async () => {
    const { client } = stubClient(async () => {
      throw new ApiError({ message: 'API base URL is not configured', status: 0, code: 'API_NOT_CONFIGURED' })
    })
    await expect(fetchSession({ client })).resolves.toBeNull()
  })

  it('propagates unexpected failures', async () => {
    const { client } = stubClient(async () => {
      throw new ApiError({ message: 'Boom', status: 500, code: 'INTERNAL' })
    })
    await expect(fetchSession({ client })).rejects.toBeInstanceOf(ApiError)
  })

  it('propagates a network failure so the UI can offer a retry', async () => {
    const { client } = stubClient(async () => {
      throw new ApiError({ message: 'Network request failed', status: 0, code: 'NETWORK_ERROR' })
    })
    await expect(fetchSession({ client })).rejects.toMatchObject({ code: 'NETWORK_ERROR' })
  })

  it('forwards an abort signal', async () => {
    const { client, request } = stubClient(async () => SESSION_PAYLOAD)
    const controller = new AbortController()
    await fetchSession({ client, signal: controller.signal })
    expect(request).toHaveBeenCalledWith('/api/v1/me', { signal: controller.signal })
  })
})

describe('signOut', () => {
  it('posts to the Better Auth sign-out endpoint', async () => {
    const { client, request } = stubClient(async () => ({ success: true }))
    await signOut({ client })
    expect(request).toHaveBeenCalledWith('/api/auth/sign-out', { method: 'POST' })
  })

  it('treats an already-expired session as a successful sign-out', async () => {
    const { client } = stubClient(async () => {
      throw new ApiError({ message: 'Authentication required', status: 401, code: 'UNAUTHENTICATED' })
    })
    await expect(signOut({ client })).resolves.toBeUndefined()
  })

  it('propagates other failures', async () => {
    const { client } = stubClient(async () => {
      throw new ApiError({ message: 'Boom', status: 500, code: 'AUTH_FAILURE' })
    })
    await expect(signOut({ client })).rejects.toMatchObject({ code: 'AUTH_FAILURE' })
  })
})
