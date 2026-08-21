import { describe, it, expect, vi } from 'vitest'
import {
  changeEmail,
  requestEmailChallenge,
  requestEmailChange,
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

describe('changing an email address', () => {
  it('asks for a code proving the current address', async () => {
    const { client, request } = stubClient({ sent: true })

    await requestEmailChallenge({ client })

    // No address in the body: the server takes it from the session, so this can
    // never be pointed at somebody else.
    expect(request).toHaveBeenCalledWith('/api/v1/me/email/challenge', {
      method: 'POST',
      signal: undefined,
    })
  })

  it('spends the current-address code to reach the new one', async () => {
    const { client, request } = stubClient({ success: true })

    await requestEmailChange({ newEmail: 'new@example.com', otp: '111111' }, { client })

    expect(request).toHaveBeenCalledWith('/api/auth/email-otp/request-email-change', {
      method: 'POST',
      body: { newEmail: 'new@example.com', otp: '111111' },
      signal: undefined,
    })
  })

  it('completes the change with the code sent to the new address', async () => {
    const { client, request } = stubClient({ success: true })

    await changeEmail({ newEmail: 'new@example.com', otp: '222222' }, { client })

    expect(request).toHaveBeenCalledWith('/api/auth/email-otp/change-email', {
      method: 'POST',
      body: { newEmail: 'new@example.com', otp: '222222' },
      signal: undefined,
    })
  })
})
