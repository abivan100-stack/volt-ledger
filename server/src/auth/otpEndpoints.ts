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
 * Resolves a request path the way a URL parser does, so the string compared here
 * is the string the upstream router will act on.
 *
 * `/api/auth/x/../sign-in/email-otp` is a blocked route wearing a different
 * spelling: Fastify's wildcard matches it verbatim, but the `new URL()` that
 * builds the forwarded request collapses the `..` back to
 * `/api/auth/sign-in/email-otp`. A blocklist that read the raw path would wave
 * it through. Percent-escapes are decoded for the same reason — a router that
 * decodes before matching would otherwise see a route this function did not.
 *
 * An undecodable escape resolves to the empty string, which matches nothing and
 * is therefore refused by the caller's allowlist rather than forwarded blind.
 */
function normaliseAuthPath(url: string): string {
  const raw = url.split('?')[0]?.split('#')[0] ?? ''
  let decoded: string
  try {
    decoded = decodeURIComponent(raw)
  } catch {
    return ''
  }

  const segments: string[] = []
  for (const segment of decoded.split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') {
      segments.pop()
      continue
    }
    segments.push(segment)
  }
  return `/${segments.join('/')}`
}

/**
 * Whether the proxy should refuse this path.
 *
 * Compares the resolved path only, so neither a query string, a trailing slash,
 * a `..` segment, nor a percent-escape can smuggle a blocked route past.
 */
export function isBlockedAuthPath(url: string): boolean {
  return BLOCKED_OTP_PATHS.includes(normaliseAuthPath(url))
}
