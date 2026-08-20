import { describe, it, expect, vi } from 'vitest'
import {
  listMemberships,
  removeMembership,
  transferOwnership,
  updateMembershipRole,
  type Membership,
} from '../memberships'
import type { ApiClient } from '../client'

const ORGANISATION_ID = '11111111-1111-4111-8111-111111111111'

const MEMBER: Membership = {
  id: 'membership-1',
  userId: 'user-1',
  email: 'asha@example.com',
  role: 'operator',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
}

function stubClient(result: unknown) {
  const request = vi.fn(async () => result)
  return { client: { request } as unknown as ApiClient, request }
}

describe('listMemberships', () => {
  it('unwraps the members envelope', async () => {
    const { client, request } = stubClient({ members: [MEMBER] })
    const members = await listMemberships(ORGANISATION_ID, { client })

    expect(request).toHaveBeenCalledWith(
      `/api/v1/organisations/${ORGANISATION_ID}/memberships`,
      { signal: undefined },
    )
    expect(members).toEqual([MEMBER])
  })
})

describe('updateMembershipRole', () => {
  it('patches the role and returns the updated member', async () => {
    const updated = { ...MEMBER, role: 'viewer' as const }
    const { client, request } = stubClient({ member: updated })

    const member = await updateMembershipRole(ORGANISATION_ID, 'user-1', 'viewer', { client })

    expect(request).toHaveBeenCalledWith(
      `/api/v1/organisations/${ORGANISATION_ID}/memberships/user-1`,
      { method: 'PATCH', body: { role: 'viewer' }, signal: undefined },
    )
    expect(member).toEqual(updated)
  })

  it('encodes a user id that is not URL-safe', async () => {
    const { client, request } = stubClient({ member: MEMBER })
    await updateMembershipRole(ORGANISATION_ID, 'user/1 2', 'viewer', { client })

    const path = (request.mock.calls[0] as unknown as [string])[0]
    expect(path).toBe(`/api/v1/organisations/${ORGANISATION_ID}/memberships/user%2F1%202`)
  })
})

describe('removeMembership', () => {
  it('sends a DELETE for the membership', async () => {
    const { client, request } = stubClient(undefined)
    await expect(removeMembership(ORGANISATION_ID, 'user-1', { client })).resolves.toBeUndefined()

    expect(request).toHaveBeenCalledWith(
      `/api/v1/organisations/${ORGANISATION_ID}/memberships/user-1`,
      { method: 'DELETE', signal: undefined },
    )
  })
})

describe('transferOwnership', () => {
  it('returns both sides of the transfer', async () => {
    const previousOwner = { ...MEMBER, userId: 'user-owner', role: 'admin' as const }
    const newOwner = { ...MEMBER, role: 'owner' as const }
    const { client, request } = stubClient({ ownership: { previousOwner, newOwner } })

    const ownership = await transferOwnership(ORGANISATION_ID, 'user-1', { client })

    expect(request).toHaveBeenCalledWith(
      `/api/v1/organisations/${ORGANISATION_ID}/ownership/transfer`,
      { method: 'POST', body: { newOwnerUserId: 'user-1' }, signal: undefined },
    )
    expect(ownership.previousOwner.role).toBe('admin')
    expect(ownership.newOwner.role).toBe('owner')
  })
})
