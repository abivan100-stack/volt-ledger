import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { AuthService } from '../auth/auth.js'
import type { OrganisationDocument } from '../db/models.js'
import { buildApp } from '../app.js'

/**
 * Finding an archive at all.
 *
 * An archived organisation has no active memberships, so it cannot appear in the
 * ordinary list — which would leave a thirty-day recovery window reachable only
 * by someone who never closed the tab. This route is the way back in, and what
 * it must get right is the deadline: the instant it publishes has to be the same
 * boundary the purge sweeps past, or something is offered as restorable after it
 * is already gone.
 */

const apps: FastifyInstance[] = []

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()))
})

const ARCHIVED_AT = new Date('2030-03-01T09:00:00.000Z')

function archived(overrides: Partial<OrganisationDocument> = {}): OrganisationDocument {
  return {
    _id: '9bf4cf78-0aeb-4ef8-9344-7d706de9e576',
    name: 'Solar Commons',
    slug: 'solar-commons',
    createdByUserId: 'user_123',
    createdAt: new Date('2030-01-01T00:00:00.000Z'),
    updatedAt: ARCHIVED_AT,
    deletedAt: ARCHIVED_AT,
    ...overrides,
  }
}

function authFor(userId: string | null): AuthService {
  return {
    handle: async () => new Response(null, { status: 204 }),
    createVerificationCode: async () => '123456',
    getSession: async () =>
      userId === null
        ? null
        : {
            user: { id: userId, name: 'Asha', email: 'asha@example.com', emailVerified: true },
            session: { id: 'session_123', expiresAt: new Date('2030-01-02T00:00:00.000Z') },
          },
  }
}

async function list(options: { organisations?: OrganisationDocument[]; userId?: string | null } = {}) {
  const listMock = vi.fn(async () => options.organisations ?? [archived()])
  const app = await buildApp({
    logger: false,
    auth: authFor(options.userId === undefined ? 'user_123' : options.userId),
    repositories: { organisations: { listRestorableForUser: listMock } } as never,
  })
  apps.push(app)
  const response = await app.inject({ method: 'GET', url: '/api/v1/organisations/archived' })
  return { response, listMock }
}

describe('GET /api/v1/organisations/archived', () => {
  it('lists what the caller can still restore', async () => {
    const { response } = await list()

    expect(response.statusCode).toBe(200)
    expect(response.json().organisations).toEqual([
      {
        id: '9bf4cf78-0aeb-4ef8-9344-7d706de9e576',
        name: 'Solar Commons',
        slug: 'solar-commons',
        archivedAt: ARCHIVED_AT.toISOString(),
        restorableUntil: expect.any(String),
      },
    ])
  })

  it('publishes a deadline measured with the same window it queried with', async () => {
    const before = Date.now()
    const { response, listMock } = await list()
    const after = Date.now()

    const [userId, cutoff] = listMock.mock.calls[0] as unknown as [string, Date]
    expect(userId).toBe('user_123')

    // The window the cutoff was measured back from and the window the deadline
    // was measured forward with have to be the same one. Publishing a thirty-day
    // deadline while querying a seven-day cutoff would offer a restore that the
    // sweep has already made impossible.
    const [entry] = response.json().organisations as Array<{ restorableUntil: string }>
    const publishedWindow =
      new Date(entry?.restorableUntil as string).getTime() - ARCHIVED_AT.getTime()
    const queriedWindow = before - cutoff.getTime()
    expect(publishedWindow).toBeGreaterThanOrEqual(queriedWindow)
    expect(publishedWindow).toBeLessThanOrEqual(after - cutoff.getTime())
  })

  it('measures the deadline from the archive, not from the request', async () => {
    // A fixed instant, so the countdown a user sees does not creep forward every
    // time the page reloads.
    const first = await list()
    const second = await list()

    const deadline = (result: typeof first) =>
      (result.response.json().organisations as Array<{ restorableUntil: string }>)[0]
        ?.restorableUntil
    expect(deadline(first)).toBe(deadline(second))
  })

  it('carries no role, because owning it at the archive is what listed it', async () => {
    const { response } = await list()

    expect(response.json().organisations[0]).not.toHaveProperty('role')
  })

  it('reports nothing to restore as an empty list, not an error', async () => {
    const { response } = await list({ organisations: [] })

    expect(response.statusCode).toBe(200)
    expect(response.json().organisations).toEqual([])
  })

  it('asks only for the caller, so one holder never sees another\u2019s archives', async () => {
    const { listMock } = await list({ userId: 'user_other' })

    const [userId] = listMock.mock.calls[0] as unknown as [string, Date]
    expect(userId).toBe('user_other')
  })

  it('requires a session', async () => {
    const { response, listMock } = await list({ userId: null })

    expect(response.statusCode).toBe(401)
    expect(listMock).not.toHaveBeenCalled()
  })

  it('is not shadowed by the organisation-by-id route', async () => {
    // `archived` is not a UUID, so reaching the wrong route would answer
    // INVALID_ORGANISATION_ID instead of a list.
    const { response } = await list()

    expect(response.json().code).toBeUndefined()
    expect(response.json().organisations).toBeDefined()
  })
})
