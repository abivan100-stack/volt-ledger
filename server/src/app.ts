import Fastify, { type FastifyInstance } from 'fastify'
import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import { fromNodeHeaders } from 'better-auth/node'
import { getAuthService, type AuthService } from './auth/auth.js'
import { env } from './config/env.js'
import { getMongoDb } from './db/mongo.js'

export interface AppOptions {
  logger?: boolean
  databasePing?: () => Promise<void>
  auth?: AuthService
}

export async function buildApp(options: AppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? true,
  })

  await app.register(helmet)
  await app.register(cors, {
    origin: env.WEB_ORIGIN,
    credentials: true,
  })
  await app.register(cookie)
  await app.register(rateLimit, {
    global: true,
    max: 100,
    timeWindow: '1 minute',
  })

  const databasePing = options.databasePing ?? (async () => {
    await getMongoDb().command({ ping: 1 })
  })
  const auth = (): AuthService => options.auth ?? getAuthService()

  app.get('/health', async (_request, reply) => {
    try {
      await databasePing()
      return {
        status: 'ok',
        service: 'volt-api',
        database: 'ok',
      }
    } catch (error) {
      app.log.error({ err: error }, 'Health check database ping failed')
      return reply.code(503).send({
        status: 'degraded',
        service: 'volt-api',
        database: 'unavailable',
      })
    }
  })

  app.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    handler: async (request, reply) => {
      try {
        const requestUrl = new URL(request.raw.url ?? request.url, env.BETTER_AUTH_URL)
        const body = request.method === 'GET' || request.body == null ? undefined : JSON.stringify(request.body)
        const authRequest = new Request(requestUrl, {
          method: request.method,
          headers: fromNodeHeaders(request.headers),
          body,
        })
        const response = await auth().handle(authRequest)

        reply.code(response.status)
        response.headers.forEach((value, key) => reply.header(key, value))
        return reply.send(response.body ? await response.text() : null)
      } catch (error) {
        app.log.error({ err: error }, 'Authentication handler failed')
        return reply.code(500).send({
          error: 'Authentication failed',
          code: 'AUTH_FAILURE',
        })
      }
    },
  })

  app.get('/api/v1/me', async (request, reply) => {
    const session = await auth().getSession(fromNodeHeaders(request.headers))
    if (!session) {
      return reply.code(401).send({
        error: 'Authentication required',
        code: 'UNAUTHENTICATED',
      })
    }

    return {
      user: session.user,
      session: {
        id: session.session.id,
        expiresAt: session.session.expiresAt.toISOString(),
      },
    }
  })

  return app
}
