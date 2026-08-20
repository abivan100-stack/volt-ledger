import { mongodbAdapter } from '@better-auth/mongo-adapter'
import { betterAuth } from 'better-auth'
import { env } from '../config/env.js'
import { getMongoClient, getMongoDb } from '../db/mongo.js'
import {
  isEmailDeliveryConfigured,
  sendVerificationEmail as sendResendVerificationEmail,
} from '../email/resend.js'

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
            sendVerificationEmail: async ({ user, url }: { user: { email: string }; url: string }) => {
              await sendResendVerificationEmail({ to: user.email, url })
            },
          },
        }
      : {}),
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
