/**
 * Which of the email-OTP plugin's endpoints Volt actually serves.
 *
 * Registering the plugin publishes nine routes in one go, and the proxy at
 * `/api/auth/*` would forward every one of them. Volt uses exactly one: the
 * redemption of a verification code. The rest are refused at the edge rather
 * than left reachable because nobody linked to them.
 *
 * Three of the blocked routes are not merely unused, they are actively wrong
 * for this application:
 *
 * - `/sign-in/email-otp` mints a brand-new account from a code alone, with
 *   `emailVerified: true` and a session, bypassing the 12-character password
 *   requirement entirely. For an account that already exists but is unverified
 *   it deletes every linked account row — including the credential row holding
 *   the password hash — as anti-takeover hardening. Volt has no passwordless
 *   sign-in, so this is pure downside.
 * - `/email-otp/reset-password` and `/forget-password/email-otp` are a second
 *   password-reset channel that no part of Volt reviewed or exposed.
 * - `/email-otp/check-verification-otp` reports whether a code is right without
 *   consuming it, and its attempt counter is not atomic, so parallel guesses
 *   all read the same starting count.
 *
 * `/email-otp/send-verification-otp` is blocked too: the app resends through
 * Better Auth's own `send-verification-email`, which the plugin overrides, so
 * the OTP-specific sender is redundant — and it takes any address from an
 * unauthenticated caller, so it would mail a registered stranger on request.
 * Proving the current mailbox during an email change goes through Volt's own
 * authenticated `/api/v1/me/email/challenge` instead, which can only ever mint a
 * code for the caller's own address.
 */

/** The email-OTP paths the app forwards. */
export const ALLOWED_OTP_PATHS: readonly string[] = [
  '/api/auth/email-otp/verify-email',
  // Changing an address: both halves require a session, and the first also
  // requires a code delivered to the current mailbox.
  '/api/auth/email-otp/request-email-change',
  '/api/auth/email-otp/change-email',
]

/** Kept for the tests that name the redemption path directly. */
export const ALLOWED_OTP_PATH = '/api/auth/email-otp/verify-email'

/** Plugin paths refused at the proxy. */
export const BLOCKED_OTP_PATHS: readonly string[] = [
  '/api/auth/sign-in/email-otp',
  '/api/auth/email-otp/send-verification-otp',
  '/api/auth/email-otp/check-verification-otp',
  '/api/auth/email-otp/request-password-reset',
  '/api/auth/email-otp/reset-password',
  '/api/auth/forget-password/email-otp',
]

/**
 * Whether the proxy should refuse this path.
 *
 * Compares the path only, so a query string cannot smuggle a blocked route
 * past, and normalises a trailing slash because the router treats the two as
 * one endpoint.
 */
export function isBlockedAuthPath(url: string): boolean {
  const path = (url.split('?')[0] ?? '').replace(/\/+$/, '')
  return BLOCKED_OTP_PATHS.includes(path)
}
