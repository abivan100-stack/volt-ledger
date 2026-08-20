import { afterEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { AuthService } from '../auth/auth.js'
import type { MembershipDocument, OrganisationDocument } from '../db/models.js'
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

const actorMembership: MembershipDocument = {
  _id: 'membership_actor',
  organisationId: organisation._id,
  userId: 'user_123',
  email: 'asha@example.com',
  role: 'owner',
  createdAt: organisation.createdAt,
  updatedAt: organisation.updatedAt,
  deletedAt: null,
}

function member(userId: string, role: MembershipDocument['role']): MembershipDocument {
  return {
    _id: `membership_${userId}`,
    organisationId: organisation._id,
    userId,
    email: `${userId}@example.com`,
    role,
    createdAt: organisation.createdAt,
    updatedAt: organisation.updatedAt,
    deletedAt: null,
  }
}

const authenticatedAuth: AuthService = {
  handle: async () => new Response(null, { status: 204 }),
  getSession: async () => ({
    user: {
      id: 'user_123',
      name: 'Asha Raman',
      email: 'asha@example.com',
      emailVerified: true,
    },
    session: {
      id: 'session_123',
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
    },
  }),
}

function createRepositories(targetRole: MembershipDocument['role'] = 'operator') {
  const target = member('user_456', targetRole)
  let updatedRole: MembershipDocument['role'] | undefined
  let removedUserId: string | undefined
  let transferredTo: string | undefined
  return {
    repositories: {
      organisations: {
        createWithOwner: async () => ({ organisation, membership: actorMembership }),
        listForUser: async () => [organisation],
        findById: async () => organisation,
      },
      memberships: {
        find: async (_organisationId: string, userId: string) =>
          userId === actorMembership.userId ? actorMembership : userId === target.userId ? target : null,
        listForOrganisation: async () => [actorMembership, target],
        updateRole: async (_organisationId: string, userId: string, role: MembershipDocument['role']) => {
          updatedRole = role
          return { ...target, userId, role }
        },
        remove: async (_organisationId: string, userId: string) => {
          removedUserId = userId
          return { ...target, userId, deletedAt: new Date('2030-01-02T00:00:00.000Z') }
        },
        transferOwnership: async (_organisationId: string, _currentOwnerUserId: string, nextOwnerUserId: string) => {
          transferredTo = nextOwnerUserId
          return {
            previousOwner: { ...actorMembership, role: 'admin' as const },
            newOwner: { ...target, userId: nextOwnerUserId, role: 'owner' as const },
          }
        },
      },
    },
    getUpdatedRole: () => updatedRole,
    getRemovedUserId: () => removedUserId,
    getTransferredTo: () => transferredTo,
  }
}

describe('membership REST API', () => {
  it('lists active organisation members for any organisation member', async () => {
    const fixture = createRepositories()
    const app = await buildApp({ logger: false, auth: authenticatedAuth, repositories: fixture.repositories as never })
    apps.push(app)

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/organisations/${organisation._id}/memberships`,
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      members: [
        {
          id: 'membership_actor',
          userId: 'user_123',
          email: 'asha@example.com',
          role: 'owner',
          createdAt: '2030-01-01T00:00:00.000Z',
          updatedAt: '2030-01-01T00:00:00.000Z',
        },
        {
          id: 'membership_user_456',
          userId: 'user_456',
          email: 'user_456@example.com',
          role: 'operator',
          createdAt: '2030-01-01T00:00:00.000Z',
          updatedAt: '2030-01-01T00:00:00.000Z',
        },
      ],
    })
  })

  it('allows an owner to change a non-owner role', async () => {
    const fixture = createRepositories()
    const app = await buildApp({ logger: false, auth: authenticatedAuth, repositories: fixture.repositories as never })
    apps.push(app)

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/organisations/${organisation._id}/memberships/user_456`,
      payload: { role: 'viewer' },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ member: { userId: 'user_456', role: 'viewer' } })
    expect(fixture.getUpdatedRole()).toBe('viewer')
  })

  it('prevents an admin from changing another admin or granting admin access', async () => {
    const fixture = createRepositories('admin')
    const adminActor = { ...actorMembership, role: 'admin' as const }
    fixture.repositories.memberships.find = async (_organisationId: string, userId: string) =>
      userId === adminActor.userId ? adminActor : userId === 'user_456' ? member('user_456', 'operator') : null
    const app = await buildApp({ logger: false, auth: authenticatedAuth, repositories: fixture.repositories as never })
    apps.push(app)

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/organisations/${organisation._id}/memberships/user_456`,
      payload: { role: 'admin' },
    })

    expect(response.statusCode).toBe(403)
    expect(response.json()).toEqual({
      error: 'You cannot grant or change that membership role',
      code: 'MEMBERSHIP_ROLE_FORBIDDEN',
    })
    expect(fixture.getUpdatedRole()).toBeUndefined()
  })

  it('protects the Owner membership from direct role changes and removal', async () => {
    const fixture = createRepositories('owner')
    const app = await buildApp({ logger: false, auth: authenticatedAuth, repositories: fixture.repositories as never })
    apps.push(app)

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/v1/organisations/${organisation._id}/memberships/user_456`,
    })

    expect(response.statusCode).toBe(403)
    expect(response.json()).toEqual({
      error: 'The Owner membership is protected',
      code: 'MEMBERSHIP_OWNER_PROTECTED',
    })
    expect(fixture.getRemovedUserId()).toBeUndefined()
  })

  it('allows an owner to remove a non-owner member', async () => {
    const fixture = createRepositories()
    const app = await buildApp({ logger: false, auth: authenticatedAuth, repositories: fixture.repositories as never })
    apps.push(app)

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/v1/organisations/${organisation._id}/memberships/user_456`,
    })

    expect(response.statusCode).toBe(204)
    expect(response.body).toBe('')
    expect(fixture.getRemovedUserId()).toBe('user_456')
  })

  it('allows only the current owner to transfer ownership to an active member', async () => {
    const fixture = createRepositories()
    const app = await buildApp({ logger: false, auth: authenticatedAuth, repositories: fixture.repositories as never })
    apps.push(app)

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/organisations/${organisation._id}/ownership/transfer`,
      payload: { newOwnerUserId: 'user_456' },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      ownership: {
        previousOwner: { userId: 'user_123', role: 'admin' },
        newOwner: { userId: 'user_456', role: 'owner' },
      },
    })
    expect(fixture.getTransferredTo()).toBe('user_456')

    const adminFixture = createRepositories()
    const adminActor = { ...actorMembership, role: 'admin' as const }
    adminFixture.repositories.memberships.find = async (_organisationId: string, userId: string) =>
      userId === adminActor.userId ? adminActor : userId === 'user_456' ? member('user_456', 'operator') : null
    const adminApp = await buildApp({ logger: false, auth: authenticatedAuth, repositories: adminFixture.repositories as never })
    apps.push(adminApp)
    const forbidden = await adminApp.inject({
      method: 'POST',
      url: `/api/v1/organisations/${organisation._id}/ownership/transfer`,
      payload: { newOwnerUserId: 'user_456' },
    })
    expect(forbidden.statusCode).toBe(403)
    expect(adminFixture.getTransferredTo()).toBeUndefined()
  })
})
