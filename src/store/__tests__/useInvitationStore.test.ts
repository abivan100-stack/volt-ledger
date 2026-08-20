import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useInvitationStore } from '../useInvitationStore'
import { useOrganisationStore } from '../useOrganisationStore'
import { useSessionStore } from '../useSessionStore'
import { ApiError } from '../../api/errors'
import type { Invitation } from '../../api/invitations'

const { listMock, createMock, revokeMock } = vi.hoisted(() => ({
  listMock: vi.fn(),
  createMock: vi.fn(),
  revokeMock: vi.fn(),
}))

vi.mock('../../api/invitations', () => ({
  listInvitations: listMock,
  createInvitation: createMock,
  revokeInvitation: revokeMock,
  acceptInvitation: vi.fn(),
}))

vi.mock('../../api/organisations', () => ({
  listOrganisations: vi.fn(async () => []),
  createOrganisation: vi.fn(),
  archiveOrganisation: vi.fn(),
}))

const ORG_A = 'org-a'
const ORG_B = 'org-b'

function invitation(id: string, overrides: Partial<Invitation> = {}): Invitation {
  return {
    id,
    email: `${id}@example.com`,
    role: 'operator',
    status: 'pending',
    expiresAt: '2026-08-08T00:00:00.000Z',
    ...overrides,
  }
}

const PENDING = invitation('invitation-1')

const pristineInvitations = useInvitationStore.getState()
const pristineOrganisations = useOrganisationStore.getState()
const pristineSession = useSessionStore.getState()

beforeEach(() => {
  useInvitationStore.setState(pristineInvitations, true)
  useOrganisationStore.setState(pristineOrganisations, true)
  useSessionStore.setState(pristineSession, true)
  listMock.mockReset()
  createMock.mockReset()
  revokeMock.mockReset()
})

describe('load', () => {
  it('stores the invitations for the organisation', async () => {
    listMock.mockResolvedValue([PENDING])
    await useInvitationStore.getState().load(ORG_A)

    const state = useInvitationStore.getState()
    expect(state.status).toBe('ready')
    expect(state.invitations).toEqual([PENDING])
    expect(state.organisationId).toBe(ORG_A)
  })

  it('records a failure and stays retryable', async () => {
    listMock.mockRejectedValueOnce(
      new ApiError({ message: 'Your role cannot perform this action', status: 403, code: 'ORGANISATION_ROLE_FORBIDDEN' }),
    )
    await useInvitationStore.getState().load(ORG_A)
    expect(useInvitationStore.getState().status).toBe('error')

    listMock.mockResolvedValueOnce([PENDING])
    await useInvitationStore.getState().load(ORG_A)
    expect(useInvitationStore.getState().status).toBe('ready')
  })

  it('ignores a slow response for an organisation that is no longer selected', async () => {
    let release: (value: Invitation[]) => void = () => {}
    listMock.mockReturnValueOnce(
      new Promise<Invitation[]>((resolve) => {
        release = resolve
      }),
    )
    const slow = useInvitationStore.getState().load(ORG_A)

    const other = invitation('invitation-2')
    listMock.mockResolvedValueOnce([other])
    await useInvitationStore.getState().load(ORG_B)

    release([PENDING])
    await slow

    expect(useInvitationStore.getState().organisationId).toBe(ORG_B)
    expect(useInvitationStore.getState().invitations).toEqual([other])
  })
})

describe('invite', () => {
  it('adds the new invitation to the top of the list', async () => {
    listMock.mockResolvedValue([PENDING])
    await useInvitationStore.getState().load(ORG_A)

    const created = invitation('invitation-2', { email: 'new@example.com', role: 'viewer' })
    createMock.mockResolvedValue(created)

    const result = await useInvitationStore
      .getState()
      .invite({ email: 'new@example.com', role: 'viewer' })

    expect(createMock).toHaveBeenCalledWith(ORG_A, { email: 'new@example.com', role: 'viewer' })
    expect(result).toEqual(created)
    expect(useInvitationStore.getState().invitations).toEqual([created, PENDING])
  })

  it('propagates an already-pending conflict without touching the list', async () => {
    listMock.mockResolvedValue([PENDING])
    await useInvitationStore.getState().load(ORG_A)

    createMock.mockRejectedValue(
      new ApiError({
        message: 'An invitation is already pending for this email',
        status: 409,
        code: 'INVITATION_ALREADY_PENDING',
      }),
    )

    await expect(
      useInvitationStore.getState().invite({ email: PENDING.email, role: 'operator' }),
    ).rejects.toMatchObject({ code: 'INVITATION_ALREADY_PENDING' })
    expect(useInvitationStore.getState().invitations).toEqual([PENDING])
  })

  it('propagates an undelivered invitation, which the server has already revoked', async () => {
    listMock.mockResolvedValue([])
    await useInvitationStore.getState().load(ORG_A)

    createMock.mockRejectedValue(
      new ApiError({
        message: 'Invitation email could not be sent',
        status: 503,
        code: 'INVITATION_DELIVERY_FAILED',
      }),
    )

    await expect(
      useInvitationStore.getState().invite({ email: 'new@example.com', role: 'viewer' }),
    ).rejects.toMatchObject({ code: 'INVITATION_DELIVERY_FAILED' })
    expect(useInvitationStore.getState().invitations).toEqual([])
  })

  it('refuses to act when no organisation is selected', async () => {
    await expect(
      useInvitationStore.getState().invite({ email: 'new@example.com', role: 'viewer' }),
    ).rejects.toThrow(/No organisation is selected/)
    expect(createMock).not.toHaveBeenCalled()
  })
})

describe('revoke', () => {
  it('marks the invitation revoked rather than dropping its record', async () => {
    listMock.mockResolvedValue([PENDING])
    await useInvitationStore.getState().load(ORG_A)

    revokeMock.mockResolvedValue(undefined)
    await useInvitationStore.getState().revoke(PENDING.id)

    expect(revokeMock).toHaveBeenCalledWith(ORG_A, PENDING.id)
    const invitations = useInvitationStore.getState().invitations
    expect(invitations).toHaveLength(1)
    expect(invitations[0]?.status).toBe('revoked')
  })

  it('leaves the invitation pending when revocation is refused', async () => {
    listMock.mockResolvedValue([PENDING])
    await useInvitationStore.getState().load(ORG_A)

    revokeMock.mockRejectedValue(
      new ApiError({ message: 'Invitation is no longer pending', status: 409, code: 'INVITATION_NOT_PENDING' }),
    )

    await expect(useInvitationStore.getState().revoke(PENDING.id)).rejects.toMatchObject({
      code: 'INVITATION_NOT_PENDING',
    })
    expect(useInvitationStore.getState().invitations[0]?.status).toBe('pending')
  })
})

describe('scope changes', () => {
  it('clears the list when the selected organisation changes', async () => {
    listMock.mockResolvedValue([PENDING])
    await useInvitationStore.getState().load(ORG_A)

    useOrganisationStore.setState({ selectedId: ORG_B })

    expect(useInvitationStore.getState().invitations).toEqual([])
    expect(useInvitationStore.getState().organisationId).toBeNull()
  })

  it('clears the list when an authenticated session ends', async () => {
    useSessionStore.setState({ status: 'authenticated' })
    listMock.mockResolvedValue([PENDING])
    await useInvitationStore.getState().load(ORG_A)

    useSessionStore.getState().expire()

    expect(useInvitationStore.getState().invitations).toEqual([])
  })
})
