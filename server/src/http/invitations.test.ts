import { afterEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { AuthService } from '../auth/auth.js'
import type {
  MembershipDocument,
  OrganisationDocument,
  OrganisationInvitationDocument,
} from '../db/models.js'
import { buildApp } from '../app.js'

const apps: FastifyInstance[] = []

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()))
})

const organisation: OrganisationDocument = {
  _id: '9bf4cf78-0aeb-4ef8-9344-7d706de9e576',
  name: 'Solar Commons',
  slug: 'solar-commons',
  createdByUserId: 'user_123',
  createdAt: new Date('2030-01-01T00:00:00.000Z'),
  updatedAt: new Date('2030-01-01T00:00:00.000Z'),
  deletedAt: null,
}

const invitation: OrganisationInvitationDocument = {
  _id: 'invitation_123',
  organisationId: organisation._id,
  email: 'friend@example.com',
  role: 'operator',
  tokenHash: 'token-hash-only',
  status: 'pending',
  invitedByUserId: 'user_123',
  expiresAt: new Date('2030-01-08T00:00:00.000Z'),
  acceptedByUserId: null,
  acceptedAt: null,
  revokedAt: null,
  createdAt: new Date('2030-01-01T00:00:00.000Z'),
  updatedAt: new Date('2030-01-01T00:00:00.000Z'),
  deletedAt: null,
}

function authFor(email = 'asha@example.com', id = 'user_123'): AuthService {
  return {
    handle: async () => new Response(null, { status: 204 }),
    createVerificationCode: async () => '123456',
    getSession: async () => ({
      user: { id, name: 'Volt User', email, emailVerified: true },
      session: { id: 'session_123', expiresAt: new Date('2030-01-01T00:00:00.000Z') },
    }),
  }
}

function membership(role: MembershipDocument['role'], userId = 'user_123'): MembershipDocument {
  return {
    _id: `membership_${userId}`,
    organisationId: organisation._id,
    userId,
    email: userId === 'user_123' ? 'asha@example.com' : 'friend@example.com',
    role,
    createdAt: organisation.createdAt,
    updatedAt: organisation.updatedAt,
    deletedAt: null,
  }
}

function createRepositories(actorRole: MembershipDocument['role'] = 'owner') {
  let revokedInvitationId: string | undefined
  let invitationInput: unknown
  let acceptedArgs: { token: string; userId: string; email: string } | undefined
  return {
    repositories: {
      organisations: {
        createWithOwner: async () => ({ organisation, membership: membership('owner') }),
        listForUser: async () => [organisation],
        findById: async () => organisation,
      },
      memberships: {
        find: async (_organisationId: string, userId: string) =>
          userId === 'user_123' ? membership(actorRole) : null,
        listForOrganisation: async () => [membership(actorRole)],
        updateRole: async () => null,
        remove: async () => null,
      },
      invitations: {
        create: async (input: unknown) => {
          invitationInput = input
          return { invitation, token: 'raw-invitation-token' }
        },
        findPendingByEmail: async () => null,
        findPendingByToken: async () => invitation,
        findById: async () => invitation,
        listForOrganisation: async () => [invitation],
        revoke: async (_organisationId: string, invitationId: string) => {
          revokedInvitationId = invitationId
          return true
        },
        accept: async (token: string, userId: string, email: string) => {
          acceptedArgs = { token, userId, email }
          return { invitation: { ...invitation, status: 'accepted' as const }, membership: membership('operator', userId) }
        },
      },
    },
    getRevokedInvitationId: () => revokedInvitationId,
    getInvitationInput: () => invitationInput,
    getAcceptedArgs: () => acceptedArgs,
  }
}

describe('organisation invitation REST API', () => {
  it('creates an invitation and never returns its raw token', async () => {
    const fixture = createRepositories()
    const app = await buildApp({
      logger: false,
      auth: authFor(),
      repositories: fixture.repositories as never,
    })
    apps.push(app)

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/organisations/${organisation._id}/invitations`,
      payload: { email: 'friend@example.com', role: 'operator' },
    })

    expect(response.statusCode).toBe(202)
    expect(response.json()).toEqual({
      invitation: {
        id: invitation._id,
        email: invitation.email,
        role: invitation.role,
        status: 'pending',
        expiresAt: invitation.expiresAt.toISOString(),
      },
    })
    expect(response.body).not.toContain('raw-invitation-token')
    expect(fixture.getInvitationInput()).toMatchObject({
      organisationId: organisation._id,
      email: 'friend@example.com',
      role: 'operator',
      emailDelivery: { organisationName: 'Solar Commons' },
    })
    expect((fixture.getInvitationInput() as { emailDelivery: { encryptedUrl: string } }).emailDelivery.encryptedUrl)
      .toMatch(/^[^.]+\.[^.]+\.[^.]+$/)
  })

  it('prevents an admin from inviting another admin', async () => {
    const fixture = createRepositories('admin')
    const app = await buildApp({
      logger: false,
      auth: authFor(),
      repositories: fixture.repositories as never,
    })
    apps.push(app)

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/organisations/${organisation._id}/invitations`,
      payload: { email: 'admin@example.com', role: 'admin' },
    })

    expect(response.statusCode).toBe(403)
    expect(response.json()).toEqual({
      error: 'You cannot grant or change that membership role',
      code: 'INVITATION_ROLE_FORBIDDEN',
    })
  })

  it('lists and revokes pending invitations for organisation managers', async () => {
    const fixture = createRepositories()
    const app = await buildApp({ logger: false, auth: authFor(), repositories: fixture.repositories as never })
    apps.push(app)

    const listResponse = await app.inject({
      method: 'GET',
      url: `/api/v1/organisations/${organisation._id}/invitations`,
    })
    expect(listResponse.statusCode).toBe(200)
    expect(listResponse.json()).toEqual({
      invitations: [
        {
          id: invitation._id,
          email: invitation.email,
          role: invitation.role,
          status: invitation.status,
          expiresAt: invitation.expiresAt.toISOString(),
          createdAt: invitation.createdAt.toISOString(),
        },
      ],
    })

    const revokeResponse = await app.inject({
      method: 'DELETE',
      url: `/api/v1/organisations/${organisation._id}/invitations/${invitation._id}`,
    })
    expect(revokeResponse.statusCode).toBe(204)
    expect(fixture.getRevokedInvitationId()).toBe(invitation._id)
  })

  it('accepts an invitation only through an authenticated email match', async () => {
    const fixture = createRepositories()
    const app = await buildApp({
      logger: false,
      auth: authFor('friend@example.com', 'user_456'),
      repositories: fixture.repositories as never,
    })
    apps.push(app)

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/invitations/accept',
      payload: { token: 'raw-invitation-token' },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      organisationId: organisation._id,
      role: 'operator',
    })
    expect(fixture.getAcceptedArgs()).toEqual({
      token: 'raw-invitation-token',
      userId: 'user_456',
      email: 'friend@example.com',
    })
  })

  it('returns a safe error when an authenticated email does not match', async () => {
    const fixture = createRepositories()
    fixture.repositories.invitations.accept = async () => {
      throw new Error('INVITATION_EMAIL_MISMATCH')
    }
    const app = await buildApp({
      logger: false,
      auth: authFor('wrong@example.com', 'user_456'),
      repositories: fixture.repositories as never,
    })
    apps.push(app)

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/invitations/accept',
      payload: { token: 'raw-invitation-token' },
    })

    expect(response.statusCode).toBe(403)
    expect(response.json()).toEqual({
      error: 'This invitation belongs to a different email address',
      code: 'INVITATION_EMAIL_MISMATCH',
    })
  })
})
