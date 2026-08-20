import { describe, expect, it } from 'vitest'
import type { AuthService } from '../auth/auth.js'
import type { MembershipDocument } from '../db/models.js'
import { getAuthenticatedSession, getOrganisationAccess } from './authorization.js'

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

function membership(role: MembershipDocument['role']): MembershipDocument {
  return {
    _id: 'membership_123',
    organisationId: 'org_123',
    userId: 'user_123',
    email: 'asha@example.com',
    role,
    createdAt: new Date('2030-01-01T00:00:00.000Z'),
    updatedAt: new Date('2030-01-01T00:00:00.000Z'),
    deletedAt: null,
  }
}

describe('organisation authorization', () => {
  it('rejects requests with no authenticated session', async () => {
    const unauthenticatedAuth: AuthService = {
      ...authenticatedAuth,
      getSession: async () => null,
    }

    await expect(getAuthenticatedSession(new Headers(), unauthenticatedAuth)).resolves.toEqual({
      ok: false,
      statusCode: 401,
      error: 'Authentication required',
      code: 'UNAUTHENTICATED',
    })
  })

  it('rejects a user with no membership for the requested organisation', async () => {
    const memberships = { find: async () => null }

    await expect(
      getOrganisationAccess(new Headers(), authenticatedAuth, memberships, 'org_123', ['viewer']),
    ).resolves.toEqual({
      ok: false,
      statusCode: 403,
      error: 'Organisation access denied',
      code: 'ORGANISATION_ACCESS_DENIED',
    })
  })

  it('rejects a viewer from an owner-or-admin action', async () => {
    const memberships = { find: async () => membership('viewer') }

    await expect(
      getOrganisationAccess(new Headers(), authenticatedAuth, memberships, 'org_123', ['owner', 'admin']),
    ).resolves.toEqual({
      ok: false,
      statusCode: 403,
      error: 'Your role cannot perform this action',
      code: 'ORGANISATION_ROLE_FORBIDDEN',
    })
  })

  it('allows a member whose role is permitted by the route', async () => {
    const memberships = { find: async () => membership('operator') }

    await expect(
      getOrganisationAccess(new Headers(), authenticatedAuth, memberships, 'org_123', ['operator', 'admin']),
    ).resolves.toMatchObject({
      ok: true,
      session: { user: { id: 'user_123' } },
      membership: { role: 'operator' },
    })
  })
})
