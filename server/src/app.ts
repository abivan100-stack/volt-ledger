import Fastify, { type FastifyInstance } from 'fastify'
import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import { fromNodeHeaders } from 'better-auth/node'
import { z } from 'zod'
import { getAuthService, type AuthService } from './auth/auth.js'
import { env } from './config/env.js'
import { getMongoDb } from './db/mongo.js'
import {
  createVoltRepositories,
  type MembershipRepository,
  type OrganisationRepository,
} from './db/repositories.js'
import type { MembershipRole, OrganisationDocument } from './db/models.js'
import { getAuthenticatedSession, getOrganisationAccess } from './http/authorization.js'

const organisationIdSchema = z.object({
  organisationId: z.string().uuid(),
})

const createOrganisationSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    slug: z.string().trim().min(3).max(64).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  })
  .strict()

export interface OrganisationRouteRepositories {
  organisations: Pick<OrganisationRepository, 'createWithOwner' | 'findById' | 'listForUser'>
  memberships: Pick<MembershipRepository, 'find'>
}

export interface AppOptions {
  logger?: boolean
  databasePing?: () => Promise<void>
  auth?: AuthService
  repositories?: OrganisationRouteRepositories
}

function serializeOrganisation(organisation: OrganisationDocument, role: MembershipRole) {
  return {
    id: organisation._id,
    name: organisation.name,
    slug: organisation.slug,
    role,
    createdAt: organisation.createdAt.toISOString(),
    updatedAt: organisation.updatedAt.toISOString(),
  }
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000
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
  const repositories = (): OrganisationRouteRepositories => options.repositories ?? createVoltRepositories(getMongoDb())

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
    const access = await getAuthenticatedSession(fromNodeHeaders(request.headers), auth())
    if (!access.ok) return reply.code(access.statusCode).send({ error: access.error, code: access.code })

    return {
      user: access.session.user,
      session: {
        id: access.session.session.id,
        expiresAt: access.session.session.expiresAt.toISOString(),
      },
    }
  })

  app.post('/api/v1/organisations', async (request, reply) => {
    const access = await getAuthenticatedSession(fromNodeHeaders(request.headers), auth())
    if (!access.ok) return reply.code(access.statusCode).send({ error: access.error, code: access.code })

    const parsed = createOrganisationSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'Invalid organisation input',
        code: 'INVALID_REQUEST',
        issues: parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
      })
    }

    try {
      const created = await repositories().organisations.createWithOwner({
        ...parsed.data,
        createdByUserId: access.session.user.id,
      })
      return reply.code(201).send({
        organisation: serializeOrganisation(created.organisation, created.membership.role),
      })
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        return reply.code(409).send({
          error: 'An organisation with this slug already exists',
          code: 'ORGANISATION_SLUG_CONFLICT',
        })
      }
      app.log.error({ err: error }, 'Organisation creation failed')
      return reply.code(500).send({
        error: 'Organisation could not be created',
        code: 'ORGANISATION_CREATE_FAILED',
      })
    }
  })

  app.get('/api/v1/organisations', async (request, reply) => {
    const access = await getAuthenticatedSession(fromNodeHeaders(request.headers), auth())
    if (!access.ok) return reply.code(access.statusCode).send({ error: access.error, code: access.code })

    const organisationRepository = repositories().organisations
    const membershipRepository = repositories().memberships
    const organisations = await organisationRepository.listForUser(access.session.user.id)
    const response = []
    for (const organisation of organisations) {
      const membership = await membershipRepository.find(organisation._id, access.session.user.id)
      if (membership) response.push(serializeOrganisation(organisation, membership.role))
    }
    return { organisations: response }
  })

  app.get('/api/v1/organisations/:organisationId', async (request, reply) => {
    const parsedParams = organisationIdSchema.safeParse(request.params)
    if (!parsedParams.success) {
      return reply.code(400).send({
        error: 'Invalid organisation identifier',
        code: 'INVALID_ORGANISATION_ID',
      })
    }

    const access = await getOrganisationAccess(
      fromNodeHeaders(request.headers),
      auth(),
      repositories().memberships,
      parsedParams.data.organisationId,
      ['owner', 'admin', 'operator', 'viewer'],
    )
    if (!access.ok) return reply.code(access.statusCode).send({ error: access.error, code: access.code })

    const organisation = await repositories().organisations.findById(parsedParams.data.organisationId)
    if (!organisation) {
      return reply.code(404).send({
        error: 'Organisation not found',
        code: 'ORGANISATION_NOT_FOUND',
      })
    }
    return { organisation: serializeOrganisation(organisation, access.membership.role) }
  })

  return app
}
