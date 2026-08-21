import { describe, expect, it } from 'vitest'
import { ALLOWED_OTP_PATH, BLOCKED_OTP_PATHS, isBlockedAuthPath } from './otpEndpoints.js'

/**
 * Adding the email-OTP plugin published nine endpoints at once. These tests pin
 * which of them the proxy will forward, because the dangerous ones are
 * dangerous by default rather than by misuse.
 */

describe('isBlockedAuthPath', () => {
  it('refuses passwordless sign-in, which would mint an account from a code', () => {
    // The plugin creates a user with emailVerified true and a session, skipping
    // the password rules entirely, and strips the credential row off an
    // existing unverified account.
    expect(isBlockedAuthPath('/api/auth/sign-in/email-otp')).toBe(true)
  })

  it('refuses the OTP sender that mails a code to an unregistered address', () => {
    expect(isBlockedAuthPath('/api/auth/email-otp/send-verification-otp')).toBe(true)
  })

  it('refuses the second password-reset channel', () => {
    expect(isBlockedAuthPath('/api/auth/email-otp/reset-password')).toBe(true)
    expect(isBlockedAuthPath('/api/auth/forget-password/email-otp')).toBe(true)
    expect(isBlockedAuthPath('/api/auth/email-otp/request-password-reset')).toBe(true)
  })

  it('refuses the non-consuming code check', () => {
    // It reports whether a code is right without spending it, and its attempt
    // counter is not atomic.
    expect(isBlockedAuthPath('/api/auth/email-otp/check-verification-otp')).toBe(true)
  })

  it('forwards the one path the app actually uses', () => {
    expect(isBlockedAuthPath(ALLOWED_OTP_PATH)).toBe(false)
  })

  it('leaves the rest of the Better Auth surface alone', () => {
    for (const path of [
      '/api/auth/sign-in/email',
      '/api/auth/sign-up/email',
      '/api/auth/sign-out',
      '/api/auth/get-session',
      '/api/auth/send-verification-email',
    ]) {
      expect(isBlockedAuthPath(path), path).toBe(false)
    }
  })

  it('is not fooled by a query string or a trailing slash', () => {
    expect(isBlockedAuthPath('/api/auth/sign-in/email-otp?redirect=/')).toBe(true)
    expect(isBlockedAuthPath('/api/auth/sign-in/email-otp/')).toBe(true)
  })

  it('blocks every plugin path except the one that is allowed', () => {
    expect(BLOCKED_OTP_PATHS).not.toContain(ALLOWED_OTP_PATH)
    for (const path of BLOCKED_OTP_PATHS) {
      expect(isBlockedAuthPath(path), path).toBe(true)
    }
  })
})
