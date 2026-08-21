import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { AuthService } from '../auth/auth.js'
import { buildApp } from '../app.js'
import { ACCOUNT_OWNS_ORGANISATIONS } from '../accounts/closure.js'

/**
 * Closing your own account.
 *
 * There is no administrator who can do this for anyone else — ADR 0011 — so the
 * route answers only for the caller's own session, and the one thing it must
 * refuse is a holder who would leave an organisation without an owner.
 */

const apps: FastifyInstance[] = []

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()))
})

const authenticated: AuthService = {
  handle: async () => new Response(null, { status: 204 }),
  createVerificationCode: async () => '123456',
  getSession: async () => ({
    user: { id: 'user_123', name: 'Asha', email: 'asha@example.com', emailVerified: true },
    session: { id: 'session_123', expiresAt: new Date('2030-01-02T00:00:00.000Z') },
  }),
}

const anonymous: AuthService = { ...authenticated, getSession: async () => null }

function createRepositories(result: {
  closed: boolean
  blockedBy?: string[]
  releasedMemberships?: number
}) {
  const close = vi.fn(async () => ({
    closed: result.closed,
    blockedBy: result.blockedBy ?? [],
    releasedMemberships: result.releasedMemberships ?? 0,
  }))
  return { close, repositories: { accounts: { close } } }
}

async function closeAccount(
  result: { closed: boolean; blockedBy?: string[]; releasedMemberships?: number },
  auth: AuthService = authenticated,
) {
  const fixture = createRepositories(result)
  const app = await buildApp({
    logger: false,
    auth,
    repositories: fixture.repositories as never,
  })
  apps.push(app)
  const response = await app.inject({ method: 'DELETE', url: '/api/v1/me' })
  return { response, close: fixture.close }
}

describe('DELETE /api/v1/me', () => {
  it('closes the account and reports what it released', async () => {
    const { response } = await closeAccount({ closed: true, releasedMemberships: 2 })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ closed: true, releasedMemberships: 2 })
  })

  it('closes the account of the caller, never one named in the request', async () => {
    const { close } = await closeAccount({ closed: true })

    // The identity comes from the session alone; there is no parameter to point
    // this at somebody else.
    expect(close).toHaveBeenCalledWith('user_123')
  })

  it('refuses while the account still owns an organisation', async () => {
    const { response } = await closeAccount({ closed: false, blockedBy: ['org_1'] })

    expect(response.statusCode).toBe(409)
    expect(response.json().code).toBe(ACCOUNT_OWNS_ORGANISATIONS)
  })

  it('says what to do about the organisations it still owns', async () => {
    const { response } = await closeAccount({ closed: false, blockedBy: ['org_1'] })

    expect(response.json().error).toMatch(/transfer ownership|archive/i)
  })

  it('names no organisation in the refusal', async () => {
    const { response } = await closeAccount({ closed: false, blockedBy: ['org_secret'] })

    // The blocker identifiers stay server-side; the caller already knows which
    // organisations they own, and the error envelope is not the place for them.
    expect(JSON.stringify(response.json())).not.toContain('org_secret')
  })

  it('requires a session', async () => {
    const { response, close } = await closeAccount({ closed: true }, anonymous)

    expect(response.statusCode).toBe(401)
    expect(close).not.toHaveBeenCalled()
  })
})
