import { send, type ResourceOptions } from './resource'

/**
 * Email/password credentials against Better Auth.
 *
 * The API sets `requireEmailVerification`, so these two calls behave differently
 * from the usual pair: sign-up does **not** start a session — it sends a
 * verification email — and signing in before verifying is rejected with 403
 * while a fresh verification email goes out. Callers must tell the user to check
 * their inbox rather than assuming they are now signed in.
 *
 * Sign-up is also refused outright when the server has no email delivery
 * configured, since an unverifiable account could never sign in.
 */

export interface EmailSignInInput {
  email: string
  password: string
  /** When false the session ends with the browser session. Defaults to true. */
  rememberMe?: boolean
}

export interface EmailSignUpInput {
  name: string
  email: string
  /** The API enforces a 12–128 character length. */
  password: string
  /** Where the verification link returns to. Defaults to this app's account page. */
  callbackURL?: string
}

export interface VerificationEmailInput {
  email: string
  callbackURL?: string
}

/**
 * Where the browser should land once the verification link is opened.
 *
 * Better Auth defaults this to `/`, which it resolves against its own origin, so
 * a freshly verified visitor is dropped on the API root rather than back in the
 * app. It is derived from the origin actually serving the app because the server
 * checks the value against its trusted origins, and returns `undefined` off a
 * browser so no unusable destination is ever sent.
 */
export function verificationCallbackUrl(
  origin: string | undefined = typeof window === 'undefined' ? undefined : window.location.origin,
): string | undefined {
  if (origin === undefined || origin === '') return undefined
  return `${origin.replace(/\/+$/, '')}/account`
}

/** Signs in and, on success, leaves a session cookie on the browser. */
export async function signInWithEmail(
  input: EmailSignInInput,
  options: ResourceOptions = {},
): Promise<void> {
  await send<unknown>(options, '/api/auth/sign-in/email', {
    method: 'POST',
    body: {
      email: input.email,
      password: input.password,
      rememberMe: input.rememberMe ?? true,
    },
  })
}

/**
 * Registers an account and triggers a verification email. Resolves without a
 * session: the user must verify their address before they can sign in.
 */
export async function signUpWithEmail(
  input: EmailSignUpInput,
  options: ResourceOptions = {},
): Promise<void> {
  const callbackURL = input.callbackURL ?? verificationCallbackUrl()

  await send<unknown>(options, '/api/auth/sign-up/email', {
    method: 'POST',
    body: {
      name: input.name,
      email: input.email,
      password: input.password,
      ...(callbackURL ? { callbackURL } : {}),
    },
  })
}

/** Requests another verification link without requiring an active session. */
export async function resendVerificationEmail(
  input: VerificationEmailInput,
  options: ResourceOptions = {},
): Promise<void> {
  const callbackURL = input.callbackURL ?? verificationCallbackUrl()

  await send<unknown>(options, '/api/auth/send-verification-email', {
    method: 'POST',
    body: {
      email: input.email,
      ...(callbackURL ? { callbackURL } : {}),
    },
  })
}
