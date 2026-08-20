import { describe, it, expect, vi } from 'vitest'
import { signInWithEmail, signUpWithEmail } from '../auth'
import type { ApiClient, ApiRequestOptions } from '../client'

type RequestCall = [string, ApiRequestOptions]

function stubClient(result: unknown = undefined) {
  const calls: RequestCall[] = []
  const request = vi.fn(async (path: string, init: ApiRequestOptions = {}) => {
    calls.push([path, init])
    return result
  })
  return { client: { request } as unknown as ApiClient, request, calls }
}

describe('signInWithEmail', () => {
  it('posts credentials to the Better Auth email sign-in endpoint', async () => {
    const { client, request } = stubClient({ redirect: false })
    await signInWithEmail({ email: 'asha@example.com', password: 'a-long-password' }, { client })

    expect(request).toHaveBeenCalledWith('/api/auth/sign-in/email', {
      method: 'POST',
      body: { email: 'asha@example.com', password: 'a-long-password', rememberMe: true },
      signal: undefined,
    })
  })

  it('honours an explicit rememberMe of false', async () => {
    const { client, calls } = stubClient()
    await signInWithEmail(
      { email: 'asha@example.com', password: 'a-long-password', rememberMe: false },
      { client },
    )

    const body = calls[0]?.[1].body as { rememberMe: boolean }
    expect(body.rememberMe).toBe(false)
  })

  it('propagates a rejected sign-in', async () => {
    const request = vi.fn(async () => {
      throw new Error('Invalid email or password')
    })
    const client = { request } as unknown as ApiClient
    await expect(
      signInWithEmail({ email: 'asha@example.com', password: 'wrong' }, { client }),
    ).rejects.toThrow('Invalid email or password')
  })
})

describe('signUpWithEmail', () => {
  it('posts the name, email and password', async () => {
    const { client, request } = stubClient({ user: { id: 'user-1' } })
    await signUpWithEmail(
      { name: 'Asha', email: 'asha@example.com', password: 'a-long-password' },
      { client },
    )

    expect(request).toHaveBeenCalledWith('/api/auth/sign-up/email', {
      method: 'POST',
      body: { name: 'Asha', email: 'asha@example.com', password: 'a-long-password' },
      signal: undefined,
    })
  })
})
