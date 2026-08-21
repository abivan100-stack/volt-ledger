import { afterEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { AuthService } from '../auth/auth.js'
import type {
  MembershipDocument,
  OrganisationDocument,
  WorkerHeartbeatDocument,
} from '../db/models.js'
import { buildApp } from '../app.js'

/**
 * Queue depth and whether anything is draining it.
 *
 * These two readings only mean something together: a backlog with a live worker
 * is a busy system, and the same backlog with a silent worker is an outage. The
 * endpoint answers both so a member never has to guess which one they are
 * looking at.
 */

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

function membership(role: MembershipDocument['role']): MembershipDocument {
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

const auth: AuthService = {
  handle: async () => new Response(null, { status: 204 }),
  createVerificationCode: async () => '123456',
  getSession: async () => ({
    user: { id: 'user_123', name: 'Volt User', email: 'asha@example.com', emailVerified: true },
    session: { id: 'session_123', expiresAt: new Date('2030-01-02T00:00:00.000Z') },
  }),
}

function heartbeat(overrides: Partial<WorkerHeartbeatDocument> = {}): WorkerHeartbeatDocument {
  return {
    _id: 'volt-worker',
    status: 'healthy',
    startedAt: new Date(Date.now() - 60_000),
    updatedAt: new Date(Date.now() - 2_000),
    lastSuccessAt: new Date(Date.now() - 2_000),
    consecutiveFailures: 0,
    processedCount: 7,
    lastErrorCode: null,
    ...overrides,
  }
}

interface FixtureOptions {
  role?: MembershipDocument['role']
  member?: boolean
  organisationExists?: boolean
  queued?: number
  running?: number
  oldestQueuedAt?: Date | null
  worker?: WorkerHeartbeatDocument | null
}

function createRepositories(options: FixtureOptions = {}) {
  return {
    organisations: {
      findById: async () => (options.organisationExists === false ? null : organisation),
    },
    memberships: {
      find: async () => (options.member === false ? null : membership(options.role ?? 'viewer')),
    },
    simulations: {
      getQueueDepth: async () => ({
        queued: options.queued ?? 0,
        running: options.running ?? 0,
        oldestQueuedAt: options.oldestQueuedAt ?? null,
      }),
    },
    workers: {
      findMostRecentHeartbeat: async () =>
        options.worker === undefined ? heartbeat() : options.worker,
    },
  }
}

async function get(options: FixtureOptions = {}, organisationId = organisation._id) {
  const app = await buildApp({
    logger: false,
    auth,
    repositories: createRepositories(options) as never,
  })
  apps.push(app)
  return app.inject({
    method: 'GET',
    url: `/api/v1/organisations/${organisationId}/simulations/queue`,
  })
}

describe('simulation queue endpoint', () => {
  it('reports the depth and the worker together', async () => {
    const response = await get({ queued: 3, running: 1 })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      queue: { queued: 3, running: 1 },
      worker: { liveness: 'live' },
    })
  })

  it('reports how long the oldest queued run has been waiting', async () => {
    const oldestQueuedAt = new Date(Date.now() - 90_000)
    const response = await get({ queued: 2, oldestQueuedAt })

    const body = response.json()
    expect(body.queue.oldestQueuedAt).toBe(oldestQueuedAt.toISOString())
    // The age is what tells a member whether the backlog is moving.
    expect(body.queue.oldestQueuedWaitSeconds).toBeGreaterThanOrEqual(89)
    expect(body.queue.oldestQueuedWaitSeconds).toBeLessThanOrEqual(95)
  })

  it('reports an empty queue without inventing a wait', async () => {
    const response = await get({ queued: 0, running: 0 })

    expect(response.json().queue).toMatchObject({
      queued: 0,
      running: 0,
      oldestQueuedAt: null,
      oldestQueuedWaitSeconds: null,
    })
  })

  it('never reports a negative wait when the clocks disagree', async () => {
    const response = await get({ queued: 1, oldestQueuedAt: new Date(Date.now() + 30_000) })

    expect(response.json().queue.oldestQueuedWaitSeconds).toBe(0)
  })

  it('says it does not know when no worker has ever reported', async () => {
    const response = await get({ worker: null })

    expect(response.json().worker).toEqual({ liveness: 'unknown', lastSeenAt: null })
  })

  it('treats a worker that went quiet as stale', async () => {
    const response = await get({ worker: heartbeat({ updatedAt: new Date(Date.now() - 600_000) }) })

    expect(response.json().worker.liveness).toBe('stale')
  })

  it('treats a failing worker as live, because it is still reporting', async () => {
    const response = await get({
      worker: heartbeat({ status: 'degraded', consecutiveFailures: 4, lastErrorCode: 'MONGO_UNAVAILABLE' }),
    })

    expect(response.json().worker.liveness).toBe('live')
  })

  it('keeps a clean shutdown distinct from a crash, however old it is', async () => {
    const response = await get({
      worker: heartbeat({ status: 'stopped', updatedAt: new Date(Date.now() - 86_400_000) }),
    })

    expect(response.json().worker.liveness).toBe('stopped')
  })

  it('does not leak the worker internals to members', async () => {
    const response = await get({
      worker: heartbeat({ status: 'degraded', consecutiveFailures: 9, lastErrorCode: 'ECONNREFUSED' }),
    })

    // Any member of any organisation can call this, so it answers "is something
    // draining the queue" and nothing about the infrastructure behind it.
    const serialised = JSON.stringify(response.json())
    expect(serialised).not.toContain('ECONNREFUSED')
    expect(serialised).not.toContain('volt-worker')
    expect(serialised).not.toContain('consecutiveFailures')
    expect(Object.keys(response.json().worker).sort()).toEqual(['lastSeenAt', 'liveness'])
  })

  it('is readable by every membership role', async () => {
    for (const role of ['owner', 'admin', 'operator', 'viewer'] as const) {
      const response = await get({ role })
      expect(response.statusCode, role).toBe(200)
    }
  })

  it('refuses a non-member', async () => {
    const response = await get({ member: false })

    expect(response.statusCode).toBe(403)
  })

  it('reports a missing organisation as not found', async () => {
    const response = await get({ organisationExists: false })

    expect(response.statusCode).toBe(404)
    expect(response.json().code).toBe('ORGANISATION_NOT_FOUND')
  })

  it('rejects an organisation identifier that is not one', async () => {
    const response = await get({}, 'not-a-uuid')

    expect(response.statusCode).toBe(400)
    expect(response.json().code).toBe('INVALID_ORGANISATION_ID')
  })
})
