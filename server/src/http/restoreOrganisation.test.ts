import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { AuthService } from '../auth/auth.js'
import type { OrganisationDocument } from '../db/models.js'
import { buildApp } from '../app.js'

/**
 * Undoing an archive.
 *
 * The route cannot authorise the usual way: while an organisation is archived
 * its memberships are soft-deleted, so a membership lookup finds nothing. The
 * repository proves owner-at-archive instead, which is why the handler passes
 * the caller's own id down rather than trusting anything in the request.
 */

const apps: FastifyInstance[] = []

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()))
})

const ORGANISATION_ID = '9bf4cf78-0aeb-4ef8-9344-7d706de9e576'

const organisation: OrganisationDocument = {
  _id: ORGANISATION_ID,
  name: 'Solar Commons',
  slug: 'solar-commons',
  createdByUserId: 'user_123',
  createdAt: new Date('2030-01-01T00:00:00.000Z'),
  updatedAt: new Date('2030-01-02T00:00:00.000Z'),
  deletedAt: null,
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

async function restore(options: {
  restored?: OrganisationDocument | null
  userId?: string | null
  organisationId?: string
} = {}) {
  const restoreMock = vi.fn(async () =>
    options.restored === undefined ? organisation : options.restored,
  )
  const app = await buildApp({
    logger: false,
    auth: authFor(options.userId === undefined ? 'user_123' : options.userId),
    repositories: { organisations: { restore: restoreMock } } as never,
  })
  apps.push(app)
  const response = await app.inject({
    method: 'POST',
    url: `/api/v1/organisations/${options.organisationId ?? ORGANISATION_ID}/restore`,
  })
  return { response, restoreMock }
}

describe('POST /api/v1/organisations/:organisationId/restore', () => {
  it('brings the organisation back', async () => {
    const { response } = await restore()

    expect(response.statusCode).toBe(200)
    expect(response.json().organisation).toMatchObject({ id: ORGANISATION_ID, slug: 'solar-commons' })
  })

  it('reports the caller as owner, since only an owner can restore', async () => {
    const { response } = await restore()

    expect(response.json().organisation.role).toBe('owner')
  })

  it('passes the caller and a cutoff to the repository', async () => {
    const { restoreMock } = await restore()

    const [organisationId, actorUserId, cutoff] = restoreMock.mock.calls[0] as unknown as [
      string,
      string,
      Date,
    ]
    expect(organisationId).toBe(ORGANISATION_ID)
    // The identity comes from the session; nothing in the request can name it.
    expect(actorUserId).toBe('user_123')
    expect(cutoff.getTime()).toBeLessThan(Date.now())
  })

  it('reports nothing restorable as not found', async () => {
    const { response } = await restore({ restored: null })

    expect(response.statusCode).toBe(404)
    expect(response.json().code).toBe('ORGANISATION_NOT_RESTORABLE')
  })

  it('does not distinguish a stranger from an expired window', async () => {
    // Both refusals come back identically, so the route never confirms that an
    // organisation exists to somebody who was never in it.
    const stranger = await restore({ restored: null, userId: 'user_other' })
    const expired = await restore({ restored: null })

    expect(stranger.response.statusCode).toBe(expired.response.statusCode)
    expect(stranger.response.json()).toEqual(expired.response.json())
  })

  it('requires a session', async () => {
    const { response, restoreMock } = await restore({ userId: null })

    expect(response.statusCode).toBe(401)
    expect(restoreMock).not.toHaveBeenCalled()
  })

  it('rejects an organisation identifier that is not one', async () => {
    const { response, restoreMock } = await restore({ organisationId: 'not-a-uuid' })

    expect(response.statusCode).toBe(400)
    expect(response.json().code).toBe('INVALID_ORGANISATION_ID')
    expect(restoreMock).not.toHaveBeenCalled()
  })
})
