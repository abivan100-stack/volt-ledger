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
  type InvitationRepository,
  type MembershipRepository,
  type OrganisationRepository,
} from './db/repositories.js'
import type {
  InvitationRole,
  MembershipDocument,
  MembershipRole,
  OrganisationDocument,
  OrganisationInvitationDocument,
} from './db/models.js'
import {
  sendOrganisationInvitationEmail,
  type OrganisationInvitationEmailInput,
} from './email/resend.js'
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
  memberships: Pick<MembershipRepository, 'find' | 'listForOrganisation' | 'updateRole' | 'remove'>
  invitations: Pick<
    InvitationRepository,
    'create' | 'findById' | 'findPendingByEmail' | 'listForOrganisation' | 'revoke' | 'accept'
  >
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
