import { createHmac } from 'node:crypto'
import { mongodbAdapter } from '@better-auth/mongo-adapter'
import { betterAuth } from 'better-auth'
import { emailOTP } from 'better-auth/plugins'
import { env } from '../config/env.js'
import { getMongoClient, getMongoDb } from '../db/mongo.js'
import { isEmailDeliveryConfigured, sendVerificationCodeEmail } from '../email/resend.js'

/** Digits in a verification code. Six is the length people expect to retype. */
export const VERIFICATION_CODE_LENGTH = 6

/** How long a code stays valid. Long enough to switch apps, short enough to matter. */
export const VERIFICATION_CODE_TTL_SECONDS = 600

/** Wrong guesses before the code is burned, against a 10^6 keyspace. */
export const VERIFICATION_CODE_ALLOWED_ATTEMPTS = 5

export interface AuthenticatedSession {
  user: {
    id: string
    name: string
    email: string
    emailVerified: boolean
  }
  session: {
    id: string
    expiresAt: Date
  }
}

export interface AuthService {
  handle: (request: Request) => Promise<Response>
  getSession: (headers: Headers) => Promise<AuthenticatedSession | null>
}

let authService: AuthService | undefined

export function getAuthService(): AuthService {
  if (authService) return authService

  const emailDeliveryConfigured = isEmailDeliveryConfigured()

  const auth = betterAuth({
    database: mongodbAdapter(getMongoDb(), { client: getMongoClient() }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: [env.WEB_ORIGIN],
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      disableSignUp: !emailDeliveryConfigured,
    },
    ...(emailDeliveryConfigured
      ? {
          emailVerification: {
            sendOnSignUp: true,
            sendOnSignIn: true,
          },
        }
      : {}),
    plugins: emailDeliveryConfigured
      ? [
          /**
           * Verification by one-time code rather than by link.
           *
           * `overrideDefaultEmailVerification` replaces Better Auth's link
           * sender at init, so every existing trigger — sign-up, a sign-in by an
           * unverified account, and the resend endpoint the UI already calls —
           * sends a code instead. Nothing else had to be rewired.
           *
           * A link carries its own proof; a six-digit code does not, so the
           * guessing budget is what protects it. Codes are stored hashed, so a
           * database read cannot complete somebody else's verification.
           */
          emailOTP({
            otpLength: VERIFICATION_CODE_LENGTH,
            expiresIn: VERIFICATION_CODE_TTL_SECONDS,
            allowedAttempts: VERIFICATION_CODE_ALLOWED_ATTEMPTS,
            /**
             * Keyed, not plain. `storeOTP: 'hashed'` is an unsalted SHA-256, and
             * a six-digit space is a million digests — precomputable in under a
             * second, so a leaked backup or a read replica would hand over every
             * live code. An HMAC keyed on the server secret is useless without
             * that secret, which is not in the database.
             */
            storeOTP: {
              hash: async (otp: string) =>
                createHmac('sha256', env.BETTER_AUTH_SECRET).update(otp).digest('base64url'),
            },
            /**
             * Volt has no passwordless sign-in. Left false, the plugin mints a
             * whole account from a code alone — verified, with a session, and no
             * password — and mails codes to addresses that never registered.
             */
            disableSignUp: true,
            overrideDefaultEmailVerification: true,
            sendVerificationOTP: async ({ email, otp }: { email: string; otp: string }) => {
              await sendVerificationCodeEmail({
                to: email,
                code: otp,
                expiresInMinutes: Math.round(VERIFICATION_CODE_TTL_SECONDS / 60),
              })
            },
          }),
        ]
      : [],
  })

  authService = {
    handle: auth.handler,
    getSession: async (headers) => {
      const result = await auth.api.getSession({ headers })
      if (!result) return null
      return {
        user: {
          id: result.user.id,
          name: result.user.name,
          email: result.user.email,
          emailVerified: result.user.emailVerified,
        },
        session: {
          id: result.session.id,
          expiresAt: result.session.expiresAt,
        },
      }
    },
  }

  return authService
}
