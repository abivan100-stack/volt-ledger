import { createHmac } from 'node:crypto'
import { mongodbAdapter } from '@better-auth/mongo-adapter'
import { betterAuth } from 'better-auth'
import { emailOTP } from 'better-auth/plugins'
import { env } from '../config/env.js'
import { getMongoClient, getMongoDb } from '../db/mongo.js'
import { createVoltRepositories } from '../db/repositories.js'
import { isEmailDeliveryConfigured } from '../email/resend.js'
import { sendVerificationCodeEmailWithRetry } from '../email/verificationDelivery.js'
import { createLogger } from '../observability/logger.js'

const logger = createLogger({ service: 'volt-api' })

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
  /**
   * Mints a verification code for an address the caller has already been proven
   * to own, and returns it for Volt to deliver.
   *
   * Exists so changing an email can require proof of the *current* mailbox
   * without exposing the plugin's own sender, which takes any address from an
   * unauthenticated caller and would happily mail a registered stranger.
   */
  createVerificationCode: (email: string) => Promise<string>
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
    databaseHooks: {
      user: {
        update: {
          // Membership rows intentionally keep an address for the organisation
          // directory. Better Auth owns email changes, so mirror the final,
          // verified address only after its user write has completed.
          after: async (user) => {
            await createVoltRepositories(getMongoDb()).memberships.syncEmail(user.id, user.email)
          },
        },
      },
    },
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
            /**
             * Changing an address proves both mailboxes: the current one, so a
             * stolen session cannot move the account somewhere the holder
             * cannot reach, and the new one, so it is real. The middleware on
             * these routes only checks that a session exists, never that it is
             * fresh, which is why the current-mailbox proof carries the weight.
             */
            changeEmail: { enabled: true, verifyCurrentEmail: true },
            overrideDefaultEmailVerification: true,
            /**
             * Wraps the send in a bounded retry rather than calling the
             * provider once. Better Auth awaits this promise but discards a
             * rejection into its own logger, so a transient failure here would
             * otherwise be invisible: the caller is told the code was sent, no
             * code arrives, and nothing tries again.
             */
            sendVerificationOTP: async ({
              email,
              otp,
              type,
            }: {
              email: string
              otp: string
              type: 'sign-in' | 'email-verification' | 'forget-password' | 'change-email'
            }) => {
              await sendVerificationCodeEmailWithRetry(
                {
                  to: email,
                  code: otp,
                  expiresInMinutes: Math.round(VERIFICATION_CODE_TTL_SECONDS / 60),
                },
                { logger: logger.child({ flow: type }) },
              )
            },
          }),
        ]
      : [],
  })

  authService = {
    handle: auth.handler,
    createVerificationCode: async (email) => {
      // Server-only endpoint: it writes the verification row and hands back the
      // raw code, never reachable over HTTP.
      return auth.api.createVerificationOTP({
        body: { email, type: 'email-verification' },
      }) as unknown as Promise<string>
    },
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
