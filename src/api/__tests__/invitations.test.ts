import { describe, it, expect, vi } from 'vitest'
import {
  acceptInvitation,
  createInvitation,
  listInvitations,
  revokeInvitation,
  type Invitation,
} from '../invitations'
import type { ApiClient } from '../client'

const ORGANISATION_ID = '11111111-1111-4111-8111-111111111111'

const INVITATION: Invitation = {
  id: 'invitation-1',
  email: 'asha@example.com',
  role: 'operator',
  status: 'pending',
  expiresAt: '2026-08-08T00:00:00.000Z',
}

function stubClient(result: unknown) {
  const request = vi.fn(async () => result)
  return { client: { request } as unknown as ApiClient, request }
}

describe('listInvitations', () => {
  it('unwraps the invitations envelope', async () => {
    const { client, request } = stubClient({ invitations: [INVITATION] })
    const invitations = await listInvitations(ORGANISATION_ID, { client })

    expect(request).toHaveBeenCalledWith(
      `/api/v1/organisations/${ORGANISATION_ID}/invitations`,
      { signal: undefined },
    )
    expect(invitations).toEqual([INVITATION])
  })
})

describe('createInvitation', () => {
  it('posts the email and role', async () => {
    const { client, request } = stubClient({ invitation: INVITATION })
    const invitation = await createInvitation(
      ORGANISATION_ID,
      { email: 'asha@example.com', role: 'operator' },
      { client },
    )

    expect(request).toHaveBeenCalledWith(
      `/api/v1/organisations/${ORGANISATION_ID}/invitations`,
      { method: 'POST', body: { email: 'asha@example.com', role: 'operator' }, signal: undefined },
    )
    expect(invitation).toEqual(INVITATION)
  })
})

describe('revokeInvitation', () => {
  it('sends a DELETE for the invitation', async () => {
    const { client, request } = stubClient(undefined)
    await expect(revokeInvitation(ORGANISATION_ID, 'invitation-1', { client })).resolves.toBeUndefined()

    expect(request).toHaveBeenCalledWith(
      `/api/v1/organisations/${ORGANISATION_ID}/invitations/invitation-1`,
      { method: 'DELETE', signal: undefined },
    )
  })

  it('encodes an invitation id that is not URL-safe', async () => {
    const { client, request } = stubClient(undefined)
    await revokeInvitation(ORGANISATION_ID, 'inv/1', { client })

    const path = (request.mock.calls[0] as unknown as [string])[0]
    expect(path).toBe(`/api/v1/organisations/${ORGANISATION_ID}/invitations/inv%2F1`)
  })
})

describe('acceptInvitation', () => {
  it('posts the token and returns the resulting membership', async () => {
    const accepted = { organisationId: ORGANISATION_ID, membershipId: 'membership-1', role: 'operator' }
    const { client, request } = stubClient(accepted)

    const result = await acceptInvitation('token-abc', { client })

    expect(request).toHaveBeenCalledWith('/api/v1/invitations/accept', {
      method: 'POST',
      body: { token: 'token-abc' },
      signal: undefined,
    })
    expect(result).toEqual(accepted)
  })
})
