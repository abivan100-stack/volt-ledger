import { describe, it, expect, vi } from 'vitest'
import {
  resendVerificationEmail,
  signInWithEmail,
  signUpWithEmail,
  verificationCallbackUrl,
} from '../auth'
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

  it('asks for the verification link to return to the app', async () => {
    const { client, request } = stubClient({ user: { id: 'user-1' } })

    await signUpWithEmail(
      {
        name: 'Asha',
        email: 'asha@example.com',
        password: 'a-long-password',
        callbackURL: 'http://localhost:5173/account',
      },
      { client },
    )

    // Without this the server defaults to "/", which resolves against the API
    // origin and drops a freshly verified visitor on the API root.
    const [, init] = request.mock.calls[0] as RequestCall
    expect((init.body as { callbackURL?: string }).callbackURL).toBe('http://localhost:5173/account')
  })
})

describe('resendVerificationEmail', () => {
  it('posts the address to Better Auth verification resend', async () => {
    const { client, request } = stubClient({ status: true })

    await resendVerificationEmail({ email: 'asha@example.com' }, { client })

    expect(request).toHaveBeenCalledWith('/api/auth/send-verification-email', {
      method: 'POST',
      body: { email: 'asha@example.com' },
      signal: undefined,
    })
  })

  it('carries the same return destination as sign-up', async () => {
    const { client, request } = stubClient({ status: true })

    await resendVerificationEmail(
      { email: 'asha@example.com', callbackURL: 'http://localhost:5173/account' },
      { client },
    )

    const [, init] = request.mock.calls[0] as RequestCall
    expect((init.body as { callbackURL?: string }).callbackURL).toBe('http://localhost:5173/account')
  })
})

describe('verificationCallbackUrl', () => {
  it('points at the account page on the origin serving the app', () => {
    expect(verificationCallbackUrl('http://localhost:5173')).toBe('http://localhost:5173/account')
  })

  it('trims a trailing slash rather than producing a doubled path', () => {
    expect(verificationCallbackUrl('http://localhost:5173/')).toBe('http://localhost:5173/account')
  })

  it('is undefined off a browser, so no unusable destination is sent', () => {
    // Better Auth checks the callback against its trusted origins; a guessed one
    // would be rejected outright.
    expect(verificationCallbackUrl(undefined)).toBeUndefined()
  })
})
