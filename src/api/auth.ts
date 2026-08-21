import { send, type ResourceOptions } from './resource'

/**
 * Email/password credentials against Better Auth.
 *
 * The API sets `requireEmailVerification`, so these two calls behave differently
 * from the usual pair: sign-up does **not** start a session — it sends a
 * verification code — and signing in before verifying is rejected with 403
 * while a fresh code goes out. Callers must collect that code and redeem it with
 * `verifyEmailOtp` rather than assuming they are now signed in.
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

export interface VerificationEmailInput {
  email: string
}

export interface VerifyEmailOtpInput {
  email: string
  /** The digits exactly as typed; the server compares against a hash. */
  otp: string
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
 * Registers an account and triggers a verification code. Resolves without a
 * session: the user must redeem the code before they can sign in.
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

/** Requests another verification code without requiring an active session. */
export async function resendVerificationEmail(
  input: VerificationEmailInput,
  options: ResourceOptions = {},
): Promise<void> {
  await send<unknown>(options, '/api/auth/send-verification-email', {
    method: 'POST',
    body: { email: input.email },
  })
}

/**
 * Redeems an emailed verification code.
 *
 * Resolves once the address is verified. It does **not** sign the visitor in —
 * the server returns no session token for this call — so the caller must send
 * them to sign in afterwards rather than assuming a session exists.
 *
 * A wrong or expired code is rejected with 400 `INVALID_OTP`. The server burns
 * the code after a small number of wrong guesses, because six digits are only
 * as safe as the guessing budget around them.
 */
export async function verifyEmailOtp(
  input: VerifyEmailOtpInput,
  options: ResourceOptions = {},
): Promise<void> {
  await send<unknown>(options, '/api/auth/email-otp/verify-email', {
    method: 'POST',
    body: { email: input.email, otp: input.otp },
  })
}
