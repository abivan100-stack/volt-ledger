import { describe, it, expect, vi } from 'vitest'
import {
  resendVerificationEmail,
  signInWithEmail,
  signUpWithEmail,
  verifyEmailOtp,
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

})

describe('verifyEmailOtp', () => {
  it('posts the address and the code to the OTP verify endpoint', async () => {
    const { client, request } = stubClient({ status: true, token: null })

    await verifyEmailOtp({ email: 'asha@example.com', otp: '123456' }, { client })

    expect(request).toHaveBeenCalledWith('/api/auth/email-otp/verify-email', {
      method: 'POST',
      body: { email: 'asha@example.com', otp: '123456' },
      signal: undefined,
    })
  })

  it('sends no callbackURL, because a code redemption does not redirect', async () => {
    const { client, request } = stubClient({ status: true, token: null })

    await verifyEmailOtp({ email: 'asha@example.com', otp: '123456' }, { client })

    const [, init] = request.mock.calls[0] as RequestCall
    expect(init.body).not.toHaveProperty('callbackURL')
  })
})
