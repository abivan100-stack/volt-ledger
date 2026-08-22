import { afterEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { AuthService } from '../auth/auth.js'
import type { AuditEventDocument, MembershipDocument, OrganisationDocument } from '../db/models.js'
import { simulationDailyRunLimit, type CreateOrganisationInput } from '../db/repositories.js'
import { buildApp, type OrganisationRouteRepositories } from '../app.js'

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

function createMembership(role: MembershipDocument['role'] = 'owner'): MembershipDocument {
  return {
    _id: 'membership_123',
    organisationId: organisation._id,
    userId: 'user_123',
    email: 'asha@example.com',
    role,
    createdAt: organisation.createdAt,
    updatedAt: organisation.updatedAt,
    deletedAt: null,
  }
}

const authenticatedAuth: AuthService = {
  handle: async () => new Response(null, { status: 204 }),
  createVerificationCode: async () => '123456',
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

function createRepositories(role: MembershipDocument['role'] = 'owner') {
  let receivedCreateInput: CreateOrganisationInput | undefined
  let deletedByUserId: string | undefined
  const auditPageOptions: unknown[] = []
  const membership = createMembership(role)
  const nextAuditCursor = { createdAt: new Date('2030-01-01T00:00:00.000Z'), id: 'audit_1' }
  return {
    repositories: {
      organisations: {
        createWithOwner: async (input) => {
          receivedCreateInput = input
          return { organisation, membership }
        },
        listForUser: async () => [organisation],
        listRestorableForUser: async () => [],
        findById: async () => organisation,
        softDelete: async (_organisationId: string, actorUserId: string) => {
          deletedByUserId = actorUserId
          return true
        },
        restore: async () => organisation,
      },
      memberships: {
        find: async () => membership,
        listForOrganisation: async () => [membership],
        updateRole: async () => null,
        remove: async () => null,
        transferOwnership: async () => null,
      },
      invitations: {
        create: async () => {
          throw new Error('Invitation repository is not used by this test')
        },
        findById: async () => null,
        findPendingByEmail: async () => null,
        listForOrganisation: async () => [],
        revoke: async () => false,
        accept: async () => {
          throw new Error('Invitation repository is not used by this test')
        },
      },
      simulations: {
        createRun: async () => {
          throw new Error('Simulation repository is not used by this test')
        },
        findRunById: async () => null,
        listForOrganisation: async () => [],
        listIntervals: async () => [],
        listSummaries: async () => [],
        getDailyQuota: async () => ({
          usageDate: '2030-01-01',
          used: 0,
          limit: simulationDailyRunLimit,
          remaining: simulationDailyRunLimit,
          resetsAt: new Date('2030-01-02T00:00:00.000Z'),
        }),
        getQueueDepth: async () => ({ queued: 0, running: 0, oldestQueuedAt: null }),
      },
      ledger: {
        settleCompletedRun: async () => { throw new Error('Ledger repository is not used by this test') },
        appendAdjustment: async () => { throw new Error('Ledger repository is not used by this test') },
        list: async () => [],
      },
      audit: {
        listForOrganisation: async () => [],
        listPageForOrganisation: async (_organisationId: string, options: unknown) => {
          auditPageOptions.push(options)
          return { events: [] as AuditEventDocument[], nextCursor: nextAuditCursor }
        },
      },
      workers: {
        findMostRecentHeartbeat: async () => null,
      },
      accounts: {
        close: async () => ({ closed: true, blockedBy: [], releasedMemberships: 0 }),
      },
    } satisfies OrganisationRouteRepositories,
    getCreateInput: () => receivedCreateInput,
    getDeletedByUserId: () => deletedByUserId,
    getAuditPageOptions: () => auditPageOptions,
  }
}

describe('organisation REST API', () => {
  it('requires authentication to create an organisation', async () => {
    const app = await buildApp({
      logger: false,
      auth: { ...authenticatedAuth, getSession: async () => null },
    })
    apps.push(app)

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/organisations',
      payload: { name: 'Solar Commons', slug: 'solar-commons' },
    })

    expect(response.statusCode).toBe(401)
    expect(response.json()).toEqual({
      error: 'Authentication required',
      code: 'UNAUTHENTICATED',
    })
  })

  it('creates an organisation with the authenticated user as owner', async () => {
    const fixture = createRepositories()
    const app = await buildApp({
      logger: false,
      auth: authenticatedAuth,
      repositories: fixture.repositories,
    })
    apps.push(app)

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/organisations',
      payload: { name: 'Solar Commons', slug: 'solar-commons' },
    })

    expect(response.statusCode).toBe(201)
    expect(response.json()).toEqual({
      organisation: {
        id: organisation._id,
        name: 'Solar Commons',
        slug: 'solar-commons',
        role: 'owner',
        createdAt: '2030-01-01T00:00:00.000Z',
        updatedAt: '2030-01-01T00:00:00.000Z',
      },
    })
    expect(fixture.getCreateInput()).toEqual({
      name: 'Solar Commons',
      slug: 'solar-commons',
      createdByUserId: 'user_123',
    })
  })

  it('rejects malformed organisation input before it reaches MongoDB', async () => {
    const fixture = createRepositories()
    const app = await buildApp({
      logger: false,
      auth: authenticatedAuth,
      repositories: fixture.repositories,
    })
    apps.push(app)

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/organisations',
      payload: { name: '', slug: 'not a slug' },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({
      error: 'Invalid organisation input',
      code: 'INVALID_REQUEST',
    })
    expect(fixture.getCreateInput()).toBeUndefined()
  })

  it('lists only organisations in which the current user has a membership', async () => {
    const fixture = createRepositories('operator')
    const app = await buildApp({
      logger: false,
      auth: authenticatedAuth,
      repositories: fixture.repositories,
    })
    apps.push(app)

    const response = await app.inject({ method: 'GET', url: '/api/v1/organisations' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      organisations: [
        {
          id: organisation._id,
          name: 'Solar Commons',
          slug: 'solar-commons',
          role: 'operator',
          createdAt: '2030-01-01T00:00:00.000Z',
          updatedAt: '2030-01-01T00:00:00.000Z',
        },
      ],
    })
  })

  it('allows a viewer to read an organisation they belong to', async () => {
    const fixture = createRepositories('viewer')
    const app = await buildApp({
      logger: false,
      auth: authenticatedAuth,
      repositories: fixture.repositories,
    })
    apps.push(app)

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/organisations/${organisation._id}`,
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      organisation: { id: organisation._id, role: 'viewer' },
    })
  })

  it('allows only the owner to soft-delete an organisation', async () => {
    const ownerFixture = createRepositories('owner')
    const ownerApp = await buildApp({ logger: false, auth: authenticatedAuth, repositories: ownerFixture.repositories })
    apps.push(ownerApp)

    const deleted = await ownerApp.inject({
      method: 'DELETE',
      url: `/api/v1/organisations/${organisation._id}`,
    })
    expect(deleted.statusCode).toBe(204)
    expect(deleted.body).toBe('')
    expect(ownerFixture.getDeletedByUserId()).toBe('user_123')

    const adminFixture = createRepositories('admin')
    const adminApp = await buildApp({ logger: false, auth: authenticatedAuth, repositories: adminFixture.repositories })
    apps.push(adminApp)
    const forbidden = await adminApp.inject({
      method: 'DELETE',
      url: `/api/v1/organisations/${organisation._id}`,
    })
    expect(forbidden.statusCode).toBe(403)
    expect(adminFixture.getDeletedByUserId()).toBeUndefined()
  })

  it('paginates and filters the organisation audit stream', async () => {
    const fixture = createRepositories()
    const app = await buildApp({ logger: false, auth: authenticatedAuth, repositories: fixture.repositories })
    apps.push(app)

    const first = await app.inject({
      method: 'GET',
      url: `/api/v1/organisations/${organisation._id}/audit-events?limit=1&action=membership.role_updated`,
    })
    expect(first.statusCode).toBe(200)
    expect(first.json()).toMatchObject({ events: [], nextCursor: expect.any(String) })
    expect(fixture.getAuditPageOptions()[0]).toEqual({ limit: 1, action: 'membership.role_updated' })

    const cursor = first.json().nextCursor as string
    const second = await app.inject({
      method: 'GET',
      url: `/api/v1/organisations/${organisation._id}/audit-events?cursor=${encodeURIComponent(cursor)}`,
    })
    expect(second.statusCode).toBe(200)
    expect(fixture.getAuditPageOptions()[1]).toMatchObject({
      limit: 100,
      before: { createdAt: new Date('2030-01-01T00:00:00.000Z'), id: 'audit_1' },
    })
  })

  it('rejects malformed audit cursors', async () => {
    const fixture = createRepositories()
    const app = await buildApp({ logger: false, auth: authenticatedAuth, repositories: fixture.repositories })
    apps.push(app)

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/organisations/${organisation._id}/audit-events?cursor=not-a-valid-cursor`,
    })
    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({ error: 'Invalid audit cursor', code: 'INVALID_AUDIT_CURSOR' })
  })
})
