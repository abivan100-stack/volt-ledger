import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useMembershipStore } from '../useMembershipStore'
import { useOrganisationStore } from '../useOrganisationStore'
import { useSessionStore } from '../useSessionStore'
import { ApiError } from '../../api/errors'
import type { Membership } from '../../api/memberships'
import type { Organisation } from '../../api/organisations'

const { listMock, updateRoleMock, removeMock, transferMock, listOrganisationsMock } = vi.hoisted(
  () => ({
    listMock: vi.fn(),
    updateRoleMock: vi.fn(),
    removeMock: vi.fn(),
    transferMock: vi.fn(),
    listOrganisationsMock: vi.fn(),
  }),
)

vi.mock('../../api/memberships', () => ({
  listMemberships: listMock,
  updateMembershipRole: updateRoleMock,
  removeMembership: removeMock,
  transferOwnership: transferMock,
}))

vi.mock('../../api/organisations', () => ({
  listOrganisations: listOrganisationsMock,
  createOrganisation: vi.fn(),
  archiveOrganisation: vi.fn(),
}))

const ORG_A = 'org-a'
const ORG_B = 'org-b'

function member(userId: string, role: Membership['role'] = 'operator'): Membership {
  return {
    id: `membership-${userId}`,
    userId,
    email: `${userId}@example.com`,
    role,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  }
}

const OWNER = member('user-owner', 'owner')
const OPERATOR = member('user-op')

const pristineMemberships = useMembershipStore.getState()
const pristineOrganisations = useOrganisationStore.getState()
const pristineSession = useSessionStore.getState()

beforeEach(() => {
  useMembershipStore.setState(pristineMemberships, true)
  useOrganisationStore.setState(pristineOrganisations, true)
  useSessionStore.setState(pristineSession, true)
  listMock.mockReset()
  updateRoleMock.mockReset()
  removeMock.mockReset()
  transferMock.mockReset()
  listOrganisationsMock.mockReset()
  listOrganisationsMock.mockResolvedValue([])
})

describe('load', () => {
  it('stores the members and records which organisation they belong to', async () => {
    listMock.mockResolvedValue([OWNER, OPERATOR])
    await useMembershipStore.getState().load(ORG_A)

    const state = useMembershipStore.getState()
    expect(state.status).toBe('ready')
    expect(state.members).toEqual([OWNER, OPERATOR])
    expect(state.organisationId).toBe(ORG_A)
  })

  it('records a failure and stays retryable', async () => {
    listMock.mockRejectedValueOnce(
      new ApiError({ message: 'Organisation access denied', status: 403, code: 'ORGANISATION_ACCESS_DENIED' }),
    )
    await useMembershipStore.getState().load(ORG_A)
    expect(useMembershipStore.getState().status).toBe('error')
    expect(useMembershipStore.getState().error).toBe('Organisation access denied')

    listMock.mockResolvedValueOnce([OWNER])
    await useMembershipStore.getState().load(ORG_A)
    expect(useMembershipStore.getState().status).toBe('ready')
  })

  it('reuses one in-flight request for the same organisation', async () => {
    listMock.mockResolvedValue([OWNER])
    await Promise.all([
      useMembershipStore.getState().load(ORG_A),
      useMembershipStore.getState().load(ORG_A),
    ])
    expect(listMock).toHaveBeenCalledTimes(1)
  })

  it('ignores a slow response for an organisation that is no longer selected', async () => {
    let releaseA: (value: Membership[]) => void = () => {}
    listMock.mockReturnValueOnce(
      new Promise<Membership[]>((resolve) => {
        releaseA = resolve
      }),
    )
    const slow = useMembershipStore.getState().load(ORG_A)

    listMock.mockResolvedValueOnce([OPERATOR])
    await useMembershipStore.getState().load(ORG_B)

    releaseA([OWNER])
    await slow

    const state = useMembershipStore.getState()
    expect(state.organisationId).toBe(ORG_B)
    expect(state.members).toEqual([OPERATOR])
  })
})

describe('changeRole', () => {
  it('replaces the member in place', async () => {
    listMock.mockResolvedValue([OWNER, OPERATOR])
    await useMembershipStore.getState().load(ORG_A)

    const updated = { ...OPERATOR, role: 'viewer' as const }
    updateRoleMock.mockResolvedValue(updated)
    await useMembershipStore.getState().changeRole(OPERATOR.userId, 'viewer')

    expect(updateRoleMock).toHaveBeenCalledWith(ORG_A, OPERATOR.userId, 'viewer')
    expect(useMembershipStore.getState().members).toEqual([OWNER, updated])
  })

  it('propagates a refusal without changing the list', async () => {
    listMock.mockResolvedValue([OWNER, OPERATOR])
    await useMembershipStore.getState().load(ORG_A)

    updateRoleMock.mockRejectedValue(
      new ApiError({ message: 'The Owner membership is protected', status: 403, code: 'MEMBERSHIP_OWNER_PROTECTED' }),
    )

    await expect(useMembershipStore.getState().changeRole(OWNER.userId, 'admin')).rejects.toMatchObject({
      code: 'MEMBERSHIP_OWNER_PROTECTED',
    })
    expect(useMembershipStore.getState().members).toEqual([OWNER, OPERATOR])
  })

  it('refuses to act when no organisation is selected', async () => {
    await expect(useMembershipStore.getState().changeRole('user-op', 'viewer')).rejects.toThrow(
      /No organisation is selected/,
    )
    expect(updateRoleMock).not.toHaveBeenCalled()
  })
})

describe('remove', () => {
  it('drops the member from the list', async () => {
    listMock.mockResolvedValue([OWNER, OPERATOR])
    await useMembershipStore.getState().load(ORG_A)

    removeMock.mockResolvedValue(undefined)
    await useMembershipStore.getState().remove(OPERATOR.userId)

    expect(removeMock).toHaveBeenCalledWith(ORG_A, OPERATOR.userId)
    expect(useMembershipStore.getState().members).toEqual([OWNER])
  })

  it('keeps the member when removal is refused', async () => {
    listMock.mockResolvedValue([OWNER, OPERATOR])
    await useMembershipStore.getState().load(ORG_A)

    removeMock.mockRejectedValue(
      new ApiError({ message: 'Membership changed before removal', status: 409, code: 'MEMBERSHIP_CHANGED' }),
    )

    await expect(useMembershipStore.getState().remove(OPERATOR.userId)).rejects.toMatchObject({
      code: 'MEMBERSHIP_CHANGED',
    })
    expect(useMembershipStore.getState().members).toEqual([OWNER, OPERATOR])
  })
})

describe('handOverOwnership', () => {
  it('applies both sides of the transfer and reloads the caller organisation role', async () => {
    useOrganisationStore.setState({ selectedId: ORG_A })
    listMock.mockResolvedValue([OWNER, OPERATOR])
    await useMembershipStore.getState().load(ORG_A)

    const demoted = { ...OWNER, role: 'admin' as const }
    const promoted = { ...OPERATOR, role: 'owner' as const }
    transferMock.mockResolvedValue({ previousOwner: demoted, newOwner: promoted })

    const organisations: Organisation[] = [
      {
        id: ORG_A,
        name: 'Nolambur',
        slug: 'nolambur',
        role: 'admin',
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z',
      },
    ]
    listOrganisationsMock.mockResolvedValue(organisations)

    await useMembershipStore.getState().handOverOwnership(OPERATOR.userId)

    expect(transferMock).toHaveBeenCalledWith(ORG_A, OPERATOR.userId)
    expect(useMembershipStore.getState().members).toEqual([demoted, promoted])
    // The acting owner is now an admin, so the organisation record must be refreshed.
    expect(listOrganisationsMock).toHaveBeenCalled()
    expect(useOrganisationStore.getState().organisations[0]?.role).toBe('admin')
  })

  it('propagates a refused transfer', async () => {
    listMock.mockResolvedValue([OWNER, OPERATOR])
    await useMembershipStore.getState().load(ORG_A)

    transferMock.mockRejectedValue(
      new ApiError({ message: 'The target membership is already the Owner', status: 409, code: 'OWNER_TRANSFER_TARGET_INVALID' }),
    )

    await expect(
      useMembershipStore.getState().handOverOwnership(OPERATOR.userId),
    ).rejects.toMatchObject({ code: 'OWNER_TRANSFER_TARGET_INVALID' })
    expect(useMembershipStore.getState().members).toEqual([OWNER, OPERATOR])
  })
})

describe('scope changes', () => {
  it('clears the list when the selected organisation changes', async () => {
    listMock.mockResolvedValue([OWNER])
    await useMembershipStore.getState().load(ORG_A)

    useOrganisationStore.setState({ selectedId: ORG_B })

    const state = useMembershipStore.getState()
    expect(state.status).toBe('unknown')
    expect(state.members).toEqual([])
    expect(state.organisationId).toBeNull()
  })

  it('clears the list when an authenticated session ends', async () => {
    useSessionStore.setState({ status: 'authenticated' })
    listMock.mockResolvedValue([OWNER])
    await useMembershipStore.getState().load(ORG_A)

    useSessionStore.getState().expire()

    expect(useMembershipStore.getState().members).toEqual([])
  })

  it('keeps the list when a selection merely resolves to the same organisation', async () => {
    listMock.mockResolvedValue([OWNER])
    await useMembershipStore.getState().load(ORG_A)

    useOrganisationStore.setState({ selectedId: ORG_A })

    expect(useMembershipStore.getState().members).toEqual([OWNER])
    expect(useMembershipStore.getState().organisationId).toBe(ORG_A)
  })
})
