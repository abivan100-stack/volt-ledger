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
  await send<unknown>(options, '/api/auth/sign-up/email', {
    method: 'POST',
    body: { name: input.name, email: input.email, password: input.password },
  })
}
