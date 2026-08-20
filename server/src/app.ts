import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify'
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
  createLedgerSeal,
  type AuditRepository,
  type InvitationRepository,
  type LedgerRepository,
  type MembershipRepository,
  type OrganisationRepository,
  type SimulationQuotaSnapshot,
  type SimulationRepository,
  type AuditEventCursor,
  type AuditEventPageOptions,
} from './db/repositories.js'
import type {
  AuditEventDocument,
  InvitationRole,
  JsonObject,
  MembershipDocument,
  MembershipRole,
  OrganisationDocument,
  OrganisationInvitationDocument,
  LedgerEventDocument,
  SimulationIntervalDocument,
  SimulationRunDocument,
  SimulationSummaryDocument,
} from './db/models.js'
import {
  sendOrganisationInvitationEmail,
  type OrganisationInvitationEmailInput,
} from './email/resend.js'
import { getAuthenticatedSession, getOrganisationAccess } from './http/authorization.js'
import {
  MONTE_CARLO_MODEL_VERSION,
  SIMULATION_DAY_TYPES,
  digestSimulationInput,
  parseMonteCarloInput,
} from './simulations/monteCarlo.js'

const organisationIdSchema = z.object({
  organisationId: z.string().uuid(),
})

const createOrganisationSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    slug: z.string().trim().min(3).max(64).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  })
  .strict()

const createSimulationSchema = z
  .object({
    seed: z.string().trim().min(1).max(128),
    simulationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    dayType: z.enum(SIMULATION_DAY_TYPES),
    households: z
      .array(
        z
          .object({
            id: z.string().trim().min(1).max(120),
            pvKw: z.number().finite().min(0).max(20),
            baseLoadKw: z.number().finite().gt(0).max(20),
          })
          .strict(),
      )
      .min(1)
      .max(50),
    sampleCount: z.number().int().min(10).max(250).default(100),
    intervalMinutes: z.union([z.literal(10), z.literal(30), z.literal(60)]).default(60),
    rateInrPerKwh: z.number().finite().min(0).max(20).default(5.5),
  })
  .strict()

const settleSimulationSchema = z.object({
  outcome: z.enum(['p10', 'p50', 'p90', 'selected']).default('selected'),
}).strict()

const createAdjustmentSchema = z.object({
  targetEventId: z.string().min(1).max(200),
  idempotencyKey: z.string().trim().min(1).max(128),
  energyKwh: z.number().finite().min(-100_000).max(100_000),
  estimatedCreditInr: z.number().finite().min(-1_000_000_000).max(1_000_000_000),
  reason: z.string().trim().min(3).max(500),
}).refine((value) => value.energyKwh !== 0 || value.estimatedCreditInr !== 0, {
  message: 'An adjustment must change energy or estimated credit',
  path: ['energyKwh'],
}).strict()

const transferOwnershipSchema = z.object({
  newOwnerUserId: z.string().trim().min(1).max(200),
}).strict()

export interface OrganisationRouteRepositories {
  organisations: Pick<OrganisationRepository, 'createWithOwner' | 'findById' | 'listForUser' | 'softDelete'>
  memberships: Pick<
    MembershipRepository,
    'find' | 'listForOrganisation' | 'updateRole' | 'remove' | 'transferOwnership'
  >
  invitations: Pick<
    InvitationRepository,
    'create' | 'findById' | 'findPendingByEmail' | 'listForOrganisation' | 'revoke' | 'accept'
  >
  simulations: Pick<
    SimulationRepository,
    'createRun' | 'getDailyQuota' | 'findRunById' | 'listForOrganisation' | 'listIntervals' | 'listSummaries'
  >
  ledger: Pick<LedgerRepository, 'settleCompletedRun' | 'appendAdjustment' | 'list'>
  audit: Pick<AuditRepository, 'listForOrganisation' | 'listPageForOrganisation'>
}

export interface InvitationEmailSender {
  sendOrganisationInvitationEmail(input: OrganisationInvitationEmailInput): Promise<void>
}

export interface AppOptions {
  logger?: boolean
  databasePing?: () => Promise<void>
  auth?: AuthService
  repositories?: OrganisationRouteRepositories
  invitationEmail?: InvitationEmailSender
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

function serializeMembership(membership: MembershipDocument) {
  return {
    id: membership._id,
    userId: membership.userId,
    email: membership.email,
    role: membership.role,
    createdAt: membership.createdAt.toISOString(),
    updatedAt: membership.updatedAt.toISOString(),
  }
}

function serializeInvitation(
  invitation: OrganisationInvitationDocument,
  includeCreatedAt = false,
) {
  return {
    id: invitation._id,
    email: invitation.email,
    role: invitation.role,
    status: invitation.status,
    expiresAt: invitation.expiresAt.toISOString(),
    ...(includeCreatedAt ? { createdAt: invitation.createdAt.toISOString() } : {}),
  }
}

function serializeSimulationRun(run: SimulationRunDocument) {
  return {
    id: run._id,
    organisationId: run.organisationId,
    requestedByUserId: run.requestedByUserId,
    seed: run.seed,
    modelVersion: run.modelVersion,
    status: run.status,
    inputDigest: run.inputDigest,
    resultDigest: run.resultDigest,
    errorCode: run.errorCode,
    createdAt: run.createdAt.toISOString(),
    startedAt: run.startedAt?.toISOString() ?? null,
    completedAt: run.completedAt?.toISOString() ?? null,
  }
}

function serializeSimulationQuota(quota: SimulationQuotaSnapshot) {
  return {
    usageDate: quota.usageDate,
    used: quota.used,
    limit: quota.limit,
    remaining: quota.remaining,
    resetsAt: quota.resetsAt.toISOString(),
  }
}

function serializeSimulationInterval(interval: SimulationIntervalDocument) {
  return {
    id: interval._id,
    householdId: interval.householdId,
    intervalStart: interval.intervalStart.toISOString(),
    intervalEnd: interval.intervalEnd.toISOString(),
    generatedKwh: interval.generatedKwh,
    consumedKwh: interval.consumedKwh,
    importedKwh: interval.importedKwh,
    exportedKwh: interval.exportedKwh,
    estimatedCreditInr: interval.estimatedCreditInr,
    outcome: interval.outcome,
    createdAt: interval.createdAt.toISOString(),
  }
}

function serializeSimulationSummary(summary: SimulationSummaryDocument) {
  return {
    id: summary._id,
    householdId: summary.householdId,
    outcome: summary.outcome,
    intervalCount: summary.intervalCount,
    generatedKwh: summary.generatedKwh,
    consumedKwh: summary.consumedKwh,
    importedKwh: summary.importedKwh,
    exportedKwh: summary.exportedKwh,
    estimatedCreditInr: summary.estimatedCreditInr,
    createdAt: summary.createdAt.toISOString(),
  }
}

function serializeLedgerEvent(event: LedgerEventDocument) {
  return {
    id: event._id,
    sequence: event.sequence,
    eventType: event.eventType,
    outcome: event.outcome,
    actorUserId: event.actorUserId,
    householdId: event.householdId,
    settlementDate: event.settlementDate,
    sourceRunId: event.sourceRunId,
    simulationResultDigest: event.simulationResultDigest,
    energyKwh: event.energyKwh,
    estimatedCreditInr: event.estimatedCreditInr,
    previousSeal: event.previousSeal,
    canonicalSeal: event.canonicalSeal,
    adjustmentTargetEventId: event.adjustmentTargetEventId,
    adjustmentReason: event.adjustmentReason,
    idempotencyKey: event.idempotencyKey,
    createdAt: event.createdAt.toISOString(),
  }
}

function serializeAuditEvent(event: AuditEventDocument) {
  return {
    id: event._id,
    actorUserId: event.actorUserId,
    action: event.action,
    entityType: event.entityType,
    entityId: event.entityId,
    metadata: event.metadata,
    createdAt: event.createdAt.toISOString(),
  }
}

function encodeAuditCursor(cursor: AuditEventCursor): string {
  return Buffer.from(JSON.stringify({ createdAt: cursor.createdAt.toISOString(), id: cursor.id }), 'utf8').toString('base64url')
}

function decodeAuditCursor(value: string): AuditEventCursor | null {
  if (value.length === 0 || value.length > 512) return null
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('createdAt' in parsed) ||
      !('id' in parsed) ||
      typeof parsed.createdAt !== 'string' ||
      typeof parsed.id !== 'string' ||
      parsed.id.length === 0 ||
      parsed.id.length > 200
    ) {
      return null
    }
    const createdAt = new Date(parsed.createdAt)
    if (Number.isNaN(createdAt.getTime())) return null
    return { createdAt, id: parsed.id }
  } catch {
    return null
  }
}

function inspectLedgerIntegrity(events: LedgerEventDocument[]) {
  const ordered = [...events].sort((left, right) => left.sequence - right.sequence)
  let valid = true
  for (let index = 0; index < ordered.length; index += 1) {
    const event = ordered[index]
    const payload = {
      organisationId: event.organisationId,
      sequence: event.sequence,
      eventType: event.eventType,
      outcome: event.outcome,
      actorUserId: event.actorUserId,
      householdId: event.householdId,
      settlementDate: event.settlementDate,
      sourceRunId: event.sourceRunId,
      simulationResultDigest: event.simulationResultDigest,
      energyKwh: event.energyKwh,
      estimatedCreditInr: event.estimatedCreditInr,
      previousSeal: event.previousSeal,
      adjustmentTargetEventId: event.adjustmentTargetEventId,
      adjustmentReason: event.adjustmentReason,
      idempotencyKey: event.idempotencyKey,
    } satisfies Omit<LedgerEventDocument, '_id' | 'canonicalSeal' | 'createdAt'>
    if (createLedgerSeal(payload) !== event.canonicalSeal) valid = false
    if (index === 0) {
      if (event.sequence === 1 ? event.previousSeal !== null : event.previousSeal === null) valid = false
    } else {
      const previous = ordered[index - 1]
      if (event.sequence !== previous.sequence + 1 || event.previousSeal !== previous.canonicalSeal) valid = false
    }
  }
  return {
    valid,
    complete: ordered.length === 0 || ordered[0].sequence === 1,
    checkedEvents: ordered.length,
    firstSequence: ordered[0]?.sequence ?? null,
    lastSequence: ordered.at(-1)?.sequence ?? null,
  }
}

function isRoleManagementAllowed(
  actorRole: MembershipRole,
  targetRole: MembershipRole,
  nextRole?: MembershipRole,
): boolean {
  if (targetRole === 'owner' || nextRole === 'owner') return false
  if (actorRole === 'owner') return true
  if (actorRole === 'admin') {
    return (targetRole === 'operator' || targetRole === 'viewer') && nextRole !== 'admin'
  }
  return false
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000
}

function isSameOriginRequest(request: FastifyRequest): boolean {
  const configuredOrigin = new URL(env.WEB_ORIGIN).origin
  const origin = request.headers.origin
  if (origin) return origin === configuredOrigin
  const referer = request.headers.referer
  if (!referer) return false
  try {
    return new URL(referer).origin === configuredOrigin
  } catch {
    return false
  }
}

export async function buildApp(options: AppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? true,
    bodyLimit: 256 * 1024,
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

  app.addHook('onRequest', async (request, reply) => {
    const stateChanging = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)
    const cookieAuthenticated = typeof request.headers.cookie === 'string' && request.headers.cookie.length > 0
    if (stateChanging && request.url.startsWith('/api/v1/') && cookieAuthenticated && !isSameOriginRequest(request)) {
      return reply.code(403).send({ error: 'Cross-site request rejected', code: 'CSRF_ORIGIN_MISMATCH' })
    }
  })

  const databasePing = options.databasePing ?? (async () => {
    await getMongoDb().command({ ping: 1 })
  })
  const auth = (): AuthService => options.auth ?? getAuthService()
  const repositories = (): OrganisationRouteRepositories => options.repositories ?? createVoltRepositories(getMongoDb())
  const invitationEmail = (): InvitationEmailSender => options.invitationEmail ?? {
    sendOrganisationInvitationEmail,
  }

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

  app.delete('/api/v1/organisations/:organisationId', async (request, reply) => {
    const parsedParams = organisationIdSchema.safeParse(request.params)
    if (!parsedParams.success) {
      return reply.code(400).send({ error: 'Invalid organisation identifier', code: 'INVALID_ORGANISATION_ID' })
    }

    const repositorySet = repositories()
    const access = await getOrganisationAccess(
      fromNodeHeaders(request.headers),
      auth(),
      repositorySet.memberships,
      parsedParams.data.organisationId,
      ['owner'],
    )
    if (!access.ok) return reply.code(access.statusCode).send({ error: access.error, code: access.code })

    const organisation = await repositorySet.organisations.findById(parsedParams.data.organisationId)
    if (!organisation) {
      return reply.code(404).send({ error: 'Organisation not found', code: 'ORGANISATION_NOT_FOUND' })
    }

    try {
      const deleted = await repositorySet.organisations.softDelete(
        parsedParams.data.organisationId,
        access.session.user.id,
      )
      if (!deleted) {
        return reply.code(409).send({ error: 'Organisation changed before deletion', code: 'ORGANISATION_CHANGED' })
      }
      return reply.code(204).send()
    } catch (error) {
      app.log.error({ err: error }, 'Organisation soft deletion failed')
      return reply.code(500).send({ error: 'Organisation could not be deleted', code: 'ORGANISATION_DELETE_FAILED' })
    }
  })

  app.post('/api/v1/organisations/:organisationId/simulations', async (request, reply) => {
    const parsedParams = organisationIdSchema.safeParse(request.params)
    if (!parsedParams.success) {
      return reply.code(400).send({
        error: 'Invalid organisation identifier',
        code: 'INVALID_ORGANISATION_ID',
      })
    }

    const parsedBody = createSimulationSchema.safeParse(request.body)
    if (!parsedBody.success) {
      return reply.code(400).send({ error: 'Invalid simulation input', code: 'INVALID_REQUEST' })
    }

    let simulationInput: ReturnType<typeof parseMonteCarloInput>
    try {
      simulationInput = parseMonteCarloInput(parsedBody.data)
    } catch {
      return reply.code(400).send({ error: 'Invalid simulation input', code: 'INVALID_REQUEST' })
    }

    const repositorySet = repositories()
    const access = await getOrganisationAccess(
      fromNodeHeaders(request.headers),
      auth(),
      repositorySet.memberships,
      parsedParams.data.organisationId,
      ['owner', 'admin', 'operator'],
    )
    if (!access.ok) return reply.code(access.statusCode).send({ error: access.error, code: access.code })

    const organisation = await repositorySet.organisations.findById(parsedParams.data.organisationId)
    if (!organisation) {
      return reply.code(404).send({ error: 'Organisation not found', code: 'ORGANISATION_NOT_FOUND' })
    }

    try {
      const run = await repositorySet.simulations.createRun({
        organisationId: parsedParams.data.organisationId,
        requestedByUserId: access.session.user.id,
        seed: parsedBody.data.seed,
        modelVersion: MONTE_CARLO_MODEL_VERSION,
        inputSnapshot: simulationInput as unknown as JsonObject,
        inputDigest: digestSimulationInput(simulationInput),
      })
      return reply.code(202).send({ run: serializeSimulationRun(run) })
    } catch (error) {
      if (error instanceof Error && error.message === 'SIMULATION_QUOTA_EXCEEDED') {
        const quota = await repositorySet.simulations.getDailyQuota(parsedParams.data.organisationId)
        const retryAfterSeconds = Math.max(1, Math.ceil((quota.resetsAt.getTime() - Date.now()) / 1000))
        reply.header('Retry-After', retryAfterSeconds)
        return reply.code(429).send({
          error: 'Daily simulation quota exceeded',
          code: 'SIMULATION_QUOTA_EXCEEDED',
          quota: serializeSimulationQuota(quota),
        })
      }
      app.log.error({ err: error }, 'Simulation run creation failed')
      return reply.code(500).send({
        error: 'Simulation run could not be queued',
        code: 'SIMULATION_QUEUE_FAILED',
      })
    }
  })

  app.get('/api/v1/organisations/:organisationId/simulations/quota', async (request, reply) => {
    const parsedParams = organisationIdSchema.safeParse(request.params)
    if (!parsedParams.success) {
      return reply.code(400).send({
        error: 'Invalid organisation identifier',
        code: 'INVALID_ORGANISATION_ID',
      })
    }

    const repositorySet = repositories()
    const access = await getOrganisationAccess(
      fromNodeHeaders(request.headers),
      auth(),
      repositorySet.memberships,
      parsedParams.data.organisationId,
      ['owner', 'admin', 'operator', 'viewer'],
    )
    if (!access.ok) return reply.code(access.statusCode).send({ error: access.error, code: access.code })

    const organisation = await repositorySet.organisations.findById(parsedParams.data.organisationId)
    if (!organisation) {
      return reply.code(404).send({ error: 'Organisation not found', code: 'ORGANISATION_NOT_FOUND' })
    }

    return { quota: serializeSimulationQuota(await repositorySet.simulations.getDailyQuota(parsedParams.data.organisationId)) }
  })

  app.get('/api/v1/organisations/:organisationId/simulations', async (request, reply) => {
    const parsedParams = organisationIdSchema.safeParse(request.params)
    if (!parsedParams.success) {
      return reply.code(400).send({
        error: 'Invalid organisation identifier',
        code: 'INVALID_ORGANISATION_ID',
      })
    }
    const parsedQuery = z
      .object({ limit: z.coerce.number().int().min(1).max(100).default(50) })
      .safeParse(request.query)
    if (!parsedQuery.success) {
      return reply.code(400).send({ error: 'Invalid simulation list options', code: 'INVALID_REQUEST' })
    }

    const repositorySet = repositories()
    const access = await getOrganisationAccess(
      fromNodeHeaders(request.headers),
      auth(),
      repositorySet.memberships,
      parsedParams.data.organisationId,
      ['owner', 'admin', 'operator', 'viewer'],
    )
    if (!access.ok) return reply.code(access.statusCode).send({ error: access.error, code: access.code })

    const organisation = await repositorySet.organisations.findById(parsedParams.data.organisationId)
    if (!organisation) {
      return reply.code(404).send({ error: 'Organisation not found', code: 'ORGANISATION_NOT_FOUND' })
    }

    const runs = await repositorySet.simulations.listForOrganisation(
      parsedParams.data.organisationId,
      parsedQuery.data.limit,
    )
    return { runs: runs.map(serializeSimulationRun) }
  })

  app.get('/api/v1/organisations/:organisationId/simulations/:runId', async (request, reply) => {
    const parsedParams = z
      .object({ organisationId: z.string().uuid(), runId: z.string().min(1).max(200) })
      .safeParse(request.params)
    if (!parsedParams.success) {
      return reply.code(400).send({ error: 'Invalid simulation identifier', code: 'INVALID_SIMULATION_ID' })
    }

    const repositorySet = repositories()
    const access = await getOrganisationAccess(
      fromNodeHeaders(request.headers),
      auth(),
      repositorySet.memberships,
      parsedParams.data.organisationId,
      ['owner', 'admin', 'operator', 'viewer'],
    )
    if (!access.ok) return reply.code(access.statusCode).send({ error: access.error, code: access.code })

    const organisation = await repositorySet.organisations.findById(parsedParams.data.organisationId)
    if (!organisation) {
      return reply.code(404).send({ error: 'Organisation not found', code: 'ORGANISATION_NOT_FOUND' })
    }

    const run = await repositorySet.simulations.findRunById(parsedParams.data.runId)
    if (!run || run.organisationId !== parsedParams.data.organisationId) {
      return reply.code(404).send({ error: 'Simulation run not found', code: 'SIMULATION_NOT_FOUND' })
    }
    return { run: serializeSimulationRun(run) }
  })

  app.get('/api/v1/organisations/:organisationId/simulations/:runId/results', async (request, reply) => {
    const parsedParams = z
      .object({ organisationId: z.string().uuid(), runId: z.string().min(1).max(200) })
      .safeParse(request.params)
    if (!parsedParams.success) {
      return reply.code(400).send({ error: 'Invalid simulation identifier', code: 'INVALID_SIMULATION_ID' })
    }
    const parsedQuery = z
      .object({ limit: z.coerce.number().int().min(1).max(10_000).default(1_000) })
      .safeParse(request.query)
    if (!parsedQuery.success) {
      return reply.code(400).send({ error: 'Invalid simulation result options', code: 'INVALID_REQUEST' })
    }

    const repositorySet = repositories()
    const access = await getOrganisationAccess(
      fromNodeHeaders(request.headers),
      auth(),
      repositorySet.memberships,
      parsedParams.data.organisationId,
      ['owner', 'admin', 'operator', 'viewer'],
    )
    if (!access.ok) return reply.code(access.statusCode).send({ error: access.error, code: access.code })

    const organisation = await repositorySet.organisations.findById(parsedParams.data.organisationId)
    if (!organisation) {
      return reply.code(404).send({ error: 'Organisation not found', code: 'ORGANISATION_NOT_FOUND' })
    }

    const run = await repositorySet.simulations.findRunById(parsedParams.data.runId)
    if (!run || run.organisationId !== parsedParams.data.organisationId) {
      return reply.code(404).send({ error: 'Simulation run not found', code: 'SIMULATION_NOT_FOUND' })
    }
    if (run.status !== 'completed') {
      return reply.code(409).send({
        error: 'Simulation results are not available yet',
        code: 'SIMULATION_NOT_COMPLETE',
      })
    }

    const [intervals, summaries] = await Promise.all([
      repositorySet.simulations.listIntervals(run._id, parsedQuery.data.limit),
      repositorySet.simulations.listSummaries(run._id),
    ])
    return {
      run: serializeSimulationRun(run),
      intervals: intervals.map(serializeSimulationInterval),
      summaries: summaries.map(serializeSimulationSummary),
    }
  })

  app.post('/api/v1/organisations/:organisationId/simulations/:runId/settlement', async (request, reply) => {
    const parsedParams = z
      .object({ organisationId: z.string().uuid(), runId: z.string().min(1).max(200) })
      .safeParse(request.params)
    if (!parsedParams.success) {
      return reply.code(400).send({ error: 'Invalid simulation identifier', code: 'INVALID_SIMULATION_ID' })
    }
    const parsedBody = settleSimulationSchema.safeParse(request.body ?? {})
    if (!parsedBody.success) {
      return reply.code(400).send({ error: 'Invalid settlement input', code: 'INVALID_REQUEST' })
    }

    const repositorySet = repositories()
    const access = await getOrganisationAccess(
      fromNodeHeaders(request.headers),
      auth(),
      repositorySet.memberships,
      parsedParams.data.organisationId,
      ['owner', 'admin'],
    )
    if (!access.ok) return reply.code(access.statusCode).send({ error: access.error, code: access.code })

    const organisation = await repositorySet.organisations.findById(parsedParams.data.organisationId)
    if (!organisation) {
      return reply.code(404).send({ error: 'Organisation not found', code: 'ORGANISATION_NOT_FOUND' })
    }

    const run = await repositorySet.simulations.findRunById(parsedParams.data.runId)
    if (!run || run.organisationId !== parsedParams.data.organisationId) {
      return reply.code(404).send({ error: 'Simulation run not found', code: 'SIMULATION_NOT_FOUND' })
    }
    if (run.status !== 'completed') {
      return reply.code(409).send({ error: 'Completed simulation run is required', code: 'SIMULATION_NOT_COMPLETE' })
    }

    try {
      const settled = await repositorySet.ledger.settleCompletedRun({
        organisationId: parsedParams.data.organisationId,
        runId: parsedParams.data.runId,
        outcome: parsedBody.data.outcome,
        actorUserId: access.session.user.id,
      })
      return reply.code(settled.alreadySettled ? 200 : 201).send({
        settlement: {
          runId: settled.run._id,
          resultDigest: settled.run.resultDigest,
          outcome: parsedBody.data.outcome,
          alreadySettled: settled.alreadySettled,
          events: settled.events.map(serializeLedgerEvent),
        },
      })
    } catch (error) {
      const code = error instanceof Error ? error.message : 'LEDGER_SETTLEMENT_FAILED'
      if (code === 'SIMULATION_NOT_COMPLETE') {
        return reply.code(409).send({ error: 'Completed simulation run is required', code })
      }
      if (code === 'SIMULATION_ALREADY_SETTLED_DIFFERENT_OUTCOME' || code === 'SIMULATION_SUMMARIES_INCOMPLETE') {
        return reply.code(409).send({ error: 'Simulation run cannot be settled with this request', code })
      }
      if (code === 'SIMULATION_RESULT_DIGEST_MISSING' || code === 'SIMULATION_DATE_MISSING' || code === 'SIMULATION_HOUSEHOLDS_MISSING') {
        return reply.code(422).send({ error: 'Simulation run is not settlement-ready', code })
      }
      app.log.error({ err: error }, 'Simulation settlement failed')
      return reply.code(500).send({ error: 'Simulation run could not be settled', code: 'LEDGER_SETTLEMENT_FAILED' })
    }
  })

  app.get('/api/v1/organisations/:organisationId/ledger', async (request, reply) => {
    const parsedParams = organisationIdSchema.safeParse(request.params)
    if (!parsedParams.success) {
      return reply.code(400).send({ error: 'Invalid organisation identifier', code: 'INVALID_ORGANISATION_ID' })
    }
    const parsedQuery = z
      .object({ limit: z.coerce.number().int().min(1).max(500).default(100) })
      .safeParse(request.query)
    if (!parsedQuery.success) {
      return reply.code(400).send({ error: 'Invalid ledger list options', code: 'INVALID_REQUEST' })
    }

    const repositorySet = repositories()
    const access = await getOrganisationAccess(
      fromNodeHeaders(request.headers),
      auth(),
      repositorySet.memberships,
      parsedParams.data.organisationId,
      ['owner', 'admin', 'operator', 'viewer'],
    )
    if (!access.ok) return reply.code(access.statusCode).send({ error: access.error, code: access.code })
    const organisation = await repositorySet.organisations.findById(parsedParams.data.organisationId)
    if (!organisation) {
      return reply.code(404).send({ error: 'Organisation not found', code: 'ORGANISATION_NOT_FOUND' })
    }

    const events = await repositorySet.ledger.list(parsedParams.data.organisationId, parsedQuery.data.limit)
    return { events: events.map(serializeLedgerEvent), integrity: inspectLedgerIntegrity(events) }
  })

  app.post('/api/v1/organisations/:organisationId/ledger/adjustments', async (request, reply) => {
    const parsedParams = organisationIdSchema.safeParse(request.params)
    if (!parsedParams.success) {
      return reply.code(400).send({ error: 'Invalid organisation identifier', code: 'INVALID_ORGANISATION_ID' })
    }
    const parsedBody = createAdjustmentSchema.safeParse(request.body)
    if (!parsedBody.success) {
      return reply.code(400).send({ error: 'Invalid ledger adjustment', code: 'INVALID_REQUEST' })
    }

    const repositorySet = repositories()
    const access = await getOrganisationAccess(
      fromNodeHeaders(request.headers),
      auth(),
      repositorySet.memberships,
      parsedParams.data.organisationId,
      ['owner', 'admin'],
    )
    if (!access.ok) return reply.code(access.statusCode).send({ error: access.error, code: access.code })
    const organisation = await repositorySet.organisations.findById(parsedParams.data.organisationId)
    if (!organisation) {
      return reply.code(404).send({ error: 'Organisation not found', code: 'ORGANISATION_NOT_FOUND' })
    }

    try {
      const result = await repositorySet.ledger.appendAdjustment({
        ...parsedBody.data,
        actorUserId: access.session.user.id,
        organisationId: parsedParams.data.organisationId,
      })
      return reply.code(result.alreadyApplied ? 200 : 201).send({
        adjustment: {
          alreadyApplied: result.alreadyApplied,
          event: serializeLedgerEvent(result.event),
        },
      })
    } catch (error) {
      const code = error instanceof Error ? error.message : 'LEDGER_ADJUSTMENT_FAILED'
      if (code === 'LEDGER_TARGET_NOT_FOUND') {
        return reply.code(404).send({ error: 'Ledger target event not found', code })
      }
      if (code === 'LEDGER_ADJUSTMENT_TARGET_INVALID' || code === 'LEDGER_IDEMPOTENCY_CONFLICT') {
        return reply.code(409).send({ error: 'Ledger adjustment cannot be applied', code })
      }
      if (code === 'LEDGER_ADJUSTMENT_INVALID') {
        return reply.code(400).send({ error: 'Invalid ledger adjustment', code: 'INVALID_REQUEST' })
      }
      app.log.error({ err: error }, 'Ledger adjustment failed')
      return reply.code(500).send({ error: 'Ledger adjustment could not be recorded', code: 'LEDGER_ADJUSTMENT_FAILED' })
    }
  })

  app.get('/api/v1/organisations/:organisationId/memberships', async (request, reply) => {
    const parsedParams = organisationIdSchema.safeParse(request.params)
    if (!parsedParams.success) {
      return reply.code(400).send({
        error: 'Invalid organisation identifier',
        code: 'INVALID_ORGANISATION_ID',
      })
    }

    const repositorySet = repositories()
    const access = await getOrganisationAccess(
      fromNodeHeaders(request.headers),
      auth(),
      repositorySet.memberships,
      parsedParams.data.organisationId,
      ['owner', 'admin', 'operator', 'viewer'],
    )
    if (!access.ok) return reply.code(access.statusCode).send({ error: access.error, code: access.code })

    const members = await repositorySet.memberships.listForOrganisation(parsedParams.data.organisationId)
    return { members: members.map(serializeMembership) }
  })

  app.get('/api/v1/organisations/:organisationId/audit-events', async (request, reply) => {
    const parsedParams = organisationIdSchema.safeParse(request.params)
    if (!parsedParams.success) {
      return reply.code(400).send({ error: 'Invalid organisation identifier', code: 'INVALID_ORGANISATION_ID' })
    }
    const parsedQuery = z
      .object({
        limit: z.coerce.number().int().min(1).max(500).default(100),
        action: z.string().trim().min(1).max(120).optional(),
        cursor: z.string().trim().min(1).max(512).optional(),
      })
      .safeParse(request.query)
    if (!parsedQuery.success) {
      return reply.code(400).send({ error: 'Invalid audit event list options', code: 'INVALID_REQUEST' })
    }
    const before = parsedQuery.data.cursor ? decodeAuditCursor(parsedQuery.data.cursor) : null
    if (parsedQuery.data.cursor && !before) {
      return reply.code(400).send({ error: 'Invalid audit cursor', code: 'INVALID_AUDIT_CURSOR' })
    }

    const repositorySet = repositories()
    const access = await getOrganisationAccess(
      fromNodeHeaders(request.headers),
      auth(),
      repositorySet.memberships,
      parsedParams.data.organisationId,
      ['owner', 'admin'],
    )
    if (!access.ok) return reply.code(access.statusCode).send({ error: access.error, code: access.code })

    const organisation = await repositorySet.organisations.findById(parsedParams.data.organisationId)
    if (!organisation) {
      return reply.code(404).send({ error: 'Organisation not found', code: 'ORGANISATION_NOT_FOUND' })
    }

    const pageOptions: AuditEventPageOptions = {
      limit: parsedQuery.data.limit,
      ...(parsedQuery.data.action ? { action: parsedQuery.data.action } : {}),
      ...(before ? { before } : {}),
    }
    const page = await repositorySet.audit.listPageForOrganisation(
      parsedParams.data.organisationId,
      pageOptions,
    )
    return {
      events: page.events.map(serializeAuditEvent),
      nextCursor: page.nextCursor ? encodeAuditCursor(page.nextCursor) : null,
    }
  })

  app.post('/api/v1/organisations/:organisationId/ownership/transfer', async (request, reply) => {
    const parsedParams = organisationIdSchema.safeParse(request.params)
    if (!parsedParams.success) {
      return reply.code(400).send({
        error: 'Invalid organisation identifier',
        code: 'INVALID_ORGANISATION_ID',
      })
    }
    const parsedBody = transferOwnershipSchema.safeParse(request.body)
    if (!parsedBody.success) {
      return reply.code(400).send({ error: 'Invalid ownership transfer input', code: 'INVALID_REQUEST' })
    }

    const repositorySet = repositories()
    const access = await getOrganisationAccess(
      fromNodeHeaders(request.headers),
      auth(),
      repositorySet.memberships,
      parsedParams.data.organisationId,
      ['owner'],
    )
    if (!access.ok) return reply.code(access.statusCode).send({ error: access.error, code: access.code })

    const organisation = await repositorySet.organisations.findById(parsedParams.data.organisationId)
    if (!organisation) {
      return reply.code(404).send({ error: 'Organisation not found', code: 'ORGANISATION_NOT_FOUND' })
    }

    try {
      const result = await repositorySet.memberships.transferOwnership(
        parsedParams.data.organisationId,
        access.session.user.id,
        parsedBody.data.newOwnerUserId,
      )
      if (!result) {
        return reply.code(409).send({ error: 'Membership changed before ownership transfer', code: 'MEMBERSHIP_CHANGED' })
      }
      return {
        ownership: {
          previousOwner: serializeMembership(result.previousOwner),
          newOwner: serializeMembership(result.newOwner),
        },
      }
    } catch (error) {
      const code = error instanceof Error ? error.message : 'OWNER_TRANSFER_FAILED'
      if (code === 'OWNER_TRANSFER_INVALID') {
        return reply.code(400).send({ error: 'The new Owner must be a different active member', code })
      }
      if (code === 'OWNER_TRANSFER_TARGET_NOT_FOUND') {
        return reply.code(404).send({ error: 'Target membership not found', code: 'MEMBERSHIP_NOT_FOUND' })
      }
      if (code === 'OWNER_TRANSFER_TARGET_INVALID') {
        return reply.code(409).send({ error: 'The target membership is already the Owner', code })
      }
      if (code === 'MEMBERSHIP_CHANGED') {
        return reply.code(409).send({ error: 'Membership changed before ownership transfer', code })
      }
      app.log.error({ err: error }, 'Ownership transfer failed')
      return reply.code(500).send({ error: 'Ownership could not be transferred', code: 'OWNER_TRANSFER_FAILED' })
    }
  })

  app.patch('/api/v1/organisations/:organisationId/memberships/:userId', async (request, reply) => {
    const parsedParams = z
      .object({ organisationId: z.string().uuid(), userId: z.string().min(1).max(200) })
      .safeParse(request.params)
    if (!parsedParams.success) {
      return reply.code(400).send({ error: 'Invalid membership identifier', code: 'INVALID_MEMBERSHIP_ID' })
    }
    const parsedBody = z.object({ role: z.enum(['admin', 'operator', 'viewer']) }).strict().safeParse(request.body)
    if (!parsedBody.success) {
      return reply.code(400).send({ error: 'Invalid membership role', code: 'INVALID_REQUEST' })
    }

    const repositorySet = repositories()
    const access = await getOrganisationAccess(
      fromNodeHeaders(request.headers),
      auth(),
      repositorySet.memberships,
      parsedParams.data.organisationId,
      ['owner', 'admin'],
    )
    if (!access.ok) return reply.code(access.statusCode).send({ error: access.error, code: access.code })

    const target = await repositorySet.memberships.find(
      parsedParams.data.organisationId,
      parsedParams.data.userId,
    )
    if (!target) return reply.code(404).send({ error: 'Membership not found', code: 'MEMBERSHIP_NOT_FOUND' })
    if (!isRoleManagementAllowed(access.membership.role, target.role, parsedBody.data.role)) {
      return reply.code(403).send({
        error: target.role === 'owner' ? 'The Owner membership is protected' : 'You cannot grant or change that membership role',
        code: target.role === 'owner' ? 'MEMBERSHIP_OWNER_PROTECTED' : 'MEMBERSHIP_ROLE_FORBIDDEN',
      })
    }

    try {
      const updated = await repositorySet.memberships.updateRole(
        parsedParams.data.organisationId,
        parsedParams.data.userId,
        parsedBody.data.role,
        access.session.user.id,
      )
      if (!updated) return reply.code(409).send({ error: 'Membership changed before update', code: 'MEMBERSHIP_CHANGED' })
      return { member: serializeMembership(updated) }
    } catch (error) {
      if (error instanceof Error && error.message === 'OWNER_PROTECTED') {
        return reply.code(403).send({ error: 'The Owner membership is protected', code: 'MEMBERSHIP_OWNER_PROTECTED' })
      }
      app.log.error({ err: error }, 'Membership role update failed')
      return reply.code(500).send({ error: 'Membership role could not be updated', code: 'MEMBERSHIP_UPDATE_FAILED' })
    }
  })

  app.delete('/api/v1/organisations/:organisationId/memberships/:userId', async (request, reply) => {
    const parsedParams = z
      .object({ organisationId: z.string().uuid(), userId: z.string().min(1).max(200) })
      .safeParse(request.params)
    if (!parsedParams.success) {
      return reply.code(400).send({ error: 'Invalid membership identifier', code: 'INVALID_MEMBERSHIP_ID' })
    }

    const repositorySet = repositories()
    const access = await getOrganisationAccess(
      fromNodeHeaders(request.headers),
      auth(),
      repositorySet.memberships,
      parsedParams.data.organisationId,
      ['owner', 'admin'],
    )
    if (!access.ok) return reply.code(access.statusCode).send({ error: access.error, code: access.code })

    const target = await repositorySet.memberships.find(
      parsedParams.data.organisationId,
      parsedParams.data.userId,
    )
    if (!target) return reply.code(404).send({ error: 'Membership not found', code: 'MEMBERSHIP_NOT_FOUND' })
    if (!isRoleManagementAllowed(access.membership.role, target.role)) {
      return reply.code(403).send({
        error: target.role === 'owner' ? 'The Owner membership is protected' : 'You cannot remove that membership',
        code: target.role === 'owner' ? 'MEMBERSHIP_OWNER_PROTECTED' : 'MEMBERSHIP_ROLE_FORBIDDEN',
      })
    }

    try {
      const removed = await repositorySet.memberships.remove(
        parsedParams.data.organisationId,
        parsedParams.data.userId,
        access.session.user.id,
      )
      if (!removed) return reply.code(409).send({ error: 'Membership changed before removal', code: 'MEMBERSHIP_CHANGED' })
      return reply.code(204).send()
    } catch (error) {
      if (error instanceof Error && error.message === 'OWNER_PROTECTED') {
        return reply.code(403).send({ error: 'The Owner membership is protected', code: 'MEMBERSHIP_OWNER_PROTECTED' })
      }
      app.log.error({ err: error }, 'Membership removal failed')
      return reply.code(500).send({ error: 'Membership could not be removed', code: 'MEMBERSHIP_REMOVE_FAILED' })
    }
  })

  app.post('/api/v1/organisations/:organisationId/invitations', async (request, reply) => {
    const parsedParams = organisationIdSchema.safeParse(request.params)
    if (!parsedParams.success) {
      return reply.code(400).send({
        error: 'Invalid organisation identifier',
        code: 'INVALID_ORGANISATION_ID',
      })
    }

    const parsedBody = z
      .object({
        email: z.string().trim().email().max(320),
        role: z.enum(['admin', 'operator', 'viewer']),
      })
      .strict()
      .safeParse(request.body)
    if (!parsedBody.success) {
      return reply.code(400).send({ error: 'Invalid invitation input', code: 'INVALID_REQUEST' })
    }

    const repositorySet = repositories()
    const access = await getOrganisationAccess(
      fromNodeHeaders(request.headers),
      auth(),
      repositorySet.memberships,
      parsedParams.data.organisationId,
      ['owner', 'admin'],
    )
    if (!access.ok) return reply.code(access.statusCode).send({ error: access.error, code: access.code })

    const role: InvitationRole = parsedBody.data.role
    if (access.membership.role === 'admin' && role === 'admin') {
      return reply.code(403).send({
        error: 'You cannot grant or change that membership role',
        code: 'INVITATION_ROLE_FORBIDDEN',
      })
    }

    const organisation = await repositorySet.organisations.findById(parsedParams.data.organisationId)
    if (!organisation) {
      return reply.code(404).send({ error: 'Organisation not found', code: 'ORGANISATION_NOT_FOUND' })
    }

    const existing = await repositorySet.invitations.findPendingByEmail(
      parsedParams.data.organisationId,
      parsedBody.data.email,
    )
    if (existing) {
      return reply.code(409).send({
        error: 'An invitation is already pending for this email',
        code: 'INVITATION_ALREADY_PENDING',
      })
    }

    let created: Awaited<ReturnType<InvitationRepository['create']>>
    try {
      created = await repositorySet.invitations.create({
        organisationId: parsedParams.data.organisationId,
        email: parsedBody.data.email,
        role,
        invitedByUserId: access.session.user.id,
      })
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        return reply.code(409).send({
          error: 'An invitation is already pending for this email',
          code: 'INVITATION_ALREADY_PENDING',
        })
      }
      app.log.error({ err: error }, 'Organisation invitation creation failed')
      return reply.code(500).send({
        error: 'Invitation could not be created',
        code: 'INVITATION_CREATE_FAILED',
      })
    }

    const invitationUrl = new URL('/invite/accept', env.WEB_ORIGIN)
    invitationUrl.searchParams.set('token', created.token)
    try {
      await invitationEmail().sendOrganisationInvitationEmail({
        to: created.invitation.email,
        organisationName: organisation.name,
        role,
        url: invitationUrl.toString(),
      })
    } catch (error) {
      await repositorySet.invitations.revoke(
        parsedParams.data.organisationId,
        created.invitation._id,
      ).catch((revokeError) => {
        app.log.error({ err: revokeError, invitationId: created.invitation._id }, 'Failed to revoke undelivered invitation')
      })
      app.log.error({ err: error, invitationId: created.invitation._id }, 'Organisation invitation email delivery failed')
      return reply.code(503).send({
        error: 'Invitation email could not be sent',
        code: 'INVITATION_DELIVERY_FAILED',
      })
    }

    return reply.code(201).send({ invitation: serializeInvitation(created.invitation) })
  })

  app.get('/api/v1/organisations/:organisationId/invitations', async (request, reply) => {
    const parsedParams = organisationIdSchema.safeParse(request.params)
    if (!parsedParams.success) {
      return reply.code(400).send({
        error: 'Invalid organisation identifier',
        code: 'INVALID_ORGANISATION_ID',
      })
    }

    const repositorySet = repositories()
    const access = await getOrganisationAccess(
      fromNodeHeaders(request.headers),
      auth(),
      repositorySet.memberships,
      parsedParams.data.organisationId,
      ['owner', 'admin'],
    )
    if (!access.ok) return reply.code(access.statusCode).send({ error: access.error, code: access.code })

    const invitations = await repositorySet.invitations.listForOrganisation(parsedParams.data.organisationId)
    return { invitations: invitations.map((invitation) => serializeInvitation(invitation, true)) }
  })

  app.delete('/api/v1/organisations/:organisationId/invitations/:invitationId', async (request, reply) => {
    const parsedParams = z
      .object({ organisationId: z.string().uuid(), invitationId: z.string().min(1).max(200) })
      .safeParse(request.params)
    if (!parsedParams.success) {
      return reply.code(400).send({ error: 'Invalid invitation identifier', code: 'INVALID_INVITATION_ID' })
    }

    const repositorySet = repositories()
    const access = await getOrganisationAccess(
      fromNodeHeaders(request.headers),
      auth(),
      repositorySet.memberships,
      parsedParams.data.organisationId,
      ['owner', 'admin'],
    )
    if (!access.ok) return reply.code(access.statusCode).send({ error: access.error, code: access.code })

    const invitation = await repositorySet.invitations.findById(
      parsedParams.data.organisationId,
      parsedParams.data.invitationId,
    )
    if (!invitation) return reply.code(404).send({ error: 'Invitation not found', code: 'INVITATION_NOT_FOUND' })
    if (access.membership.role === 'admin' && invitation.role === 'admin') {
      return reply.code(403).send({
        error: 'You cannot grant or change that membership role',
        code: 'INVITATION_ROLE_FORBIDDEN',
      })
    }
    if (invitation.status !== 'pending') {
      return reply.code(409).send({ error: 'Invitation is no longer pending', code: 'INVITATION_NOT_PENDING' })
    }

    try {
      const revoked = await repositorySet.invitations.revoke(
        parsedParams.data.organisationId,
        parsedParams.data.invitationId,
      )
      if (!revoked) {
        return reply.code(409).send({ error: 'Invitation changed before revocation', code: 'INVITATION_CHANGED' })
      }
      return reply.code(204).send()
    } catch (error) {
      app.log.error({ err: error }, 'Organisation invitation revocation failed')
      return reply.code(500).send({
        error: 'Invitation could not be revoked',
        code: 'INVITATION_REVOKE_FAILED',
      })
    }
  })

  app.post('/api/v1/invitations/accept', async (request, reply) => {
    const access = await getAuthenticatedSession(fromNodeHeaders(request.headers), auth())
    if (!access.ok) return reply.code(access.statusCode).send({ error: access.error, code: access.code })
    if (!access.session.user.emailVerified) {
      return reply.code(403).send({ error: 'Email verification is required', code: 'EMAIL_NOT_VERIFIED' })
    }

    const parsedBody = z.object({ token: z.string().min(1).max(256) }).strict().safeParse(request.body)
    if (!parsedBody.success) {
      return reply.code(400).send({ error: 'Invalid invitation acceptance input', code: 'INVALID_REQUEST' })
    }

    try {
      const accepted = await repositories().invitations.accept(
        parsedBody.data.token,
        access.session.user.id,
        access.session.user.email,
      )
      return {
        organisationId: accepted.invitation.organisationId,
        membershipId: accepted.membership._id,
        role: accepted.membership.role,
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : ''
      if (reason === 'INVITATION_EMAIL_MISMATCH') {
        return reply.code(403).send({
          error: 'This invitation belongs to a different email address',
          code: 'INVITATION_EMAIL_MISMATCH',
        })
      }
      if (reason === 'INVITATION_NOT_FOUND' || reason === 'INVITATION_EXPIRED') {
        return reply.code(400).send({ error: 'Invitation is invalid or expired', code: 'INVITATION_INVALID' })
      }
      if (reason === 'MEMBERSHIP_EXISTS') {
        return reply.code(409).send({
          error: 'You already belong to this organisation',
          code: 'MEMBERSHIP_EXISTS',
        })
      }
      app.log.error({ err: error }, 'Organisation invitation acceptance failed')
      return reply.code(500).send({
        error: 'Invitation could not be accepted',
        code: 'INVITATION_ACCEPT_FAILED',
      })
    }
  })

  return app
}
