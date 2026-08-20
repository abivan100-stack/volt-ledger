// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import MemberList from '../MemberList'
import { useMembershipStore } from '../../../store/useMembershipStore'
import { useOrganisationStore } from '../../../store/useOrganisationStore'
import { useSessionStore } from '../../../store/useSessionStore'
import { ApiError } from '../../../api/errors'
import type { Membership } from '../../../api/memberships'
import type { MembershipRole } from '../../../lib/permissions'
import type { Organisation } from '../../../api/organisations'

const { listMock, updateRoleMock, removeMock, transferMock } = vi.hoisted(() => ({
  listMock: vi.fn(),
  updateRoleMock: vi.fn(),
  removeMock: vi.fn(),
  transferMock: vi.fn(),
}))

vi.mock('../../../api/memberships', () => ({
  listMemberships: listMock,
  updateMembershipRole: updateRoleMock,
  removeMembership: removeMock,
  transferOwnership: transferMock,
}))

vi.mock('../../../api/organisations', () => ({
  listOrganisations: vi.fn(async () => []),
  createOrganisation: vi.fn(),
  archiveOrganisation: vi.fn(),
}))

const ORG_ID = 'org-a'

function member(
  userId: string,
  role: MembershipRole,
  email: string | null = `${userId}@example.com`,
): Membership {
  return {
    id: `membership-${userId}`,
    userId,
    email,
    role,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  }
}

const OWNER = member('user-owner', 'owner')
const ADMIN = member('user-admin', 'admin')
const OPERATOR = member('user-op', 'operator')

/** Membership.email is nullable in the API; these fixtures always set one. */
function emailOf(entry: Membership): string {
  if (entry.email === null) throw new Error('fixture is missing an email')
  return entry.email
}

function organisation(role: MembershipRole): Organisation {
  return {
    id: ORG_ID,
    name: 'Nolambur Microgrid',
    slug: 'nolambur-microgrid',
    role,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  }
}

const pristineMemberships = useMembershipStore.getState()
const pristineOrganisations = useOrganisationStore.getState()
const pristineSession = useSessionStore.getState()

function signInAs(userId: string, role: MembershipRole): void {
  useOrganisationStore.setState({
    status: 'ready',
    organisations: [organisation(role)],
    selectedId: ORG_ID,
  })
  useSessionStore.setState({
    status: 'authenticated',
    user: { id: userId, name: 'Tester', email: `${userId}@example.com`, emailVerified: true },
  })
}

beforeEach(() => {
  useMembershipStore.setState(pristineMemberships, true)
  useOrganisationStore.setState(pristineOrganisations, true)
  useSessionStore.setState(pristineSession, true)
  listMock.mockReset()
  updateRoleMock.mockReset()
  removeMock.mockReset()
  transferMock.mockReset()
  listMock.mockResolvedValue([OWNER, ADMIN, OPERATOR])
})

afterEach(() => {
  cleanup()
})

async function renderAsOwner(): Promise<void> {
  signInAs(OWNER.userId, 'owner')
  render(<MemberList />)
  await waitFor(() => expect(useMembershipStore.getState().status).toBe('ready'))
}

describe('MemberList', () => {
  it('renders nothing when no organisation is selected', () => {
    const { container } = render(<MemberList />)
    expect(container.textContent).toBe('')
    expect(listMock).not.toHaveBeenCalled()
  })

  it('loads the members of the selected organisation', async () => {
    await renderAsOwner()
    expect(listMock).toHaveBeenCalledWith(ORG_ID)
    expect(screen.getByText(emailOf(OPERATOR))).toBeTruthy()
  })

  it('offers a retry when the list fails', async () => {
    listMock.mockReset()
    listMock.mockRejectedValueOnce(
      new ApiError({ message: 'Organisation access denied', status: 403, code: 'ORGANISATION_ACCESS_DENIED' }),
    )
    signInAs(OWNER.userId, 'owner')
    render(<MemberList />)

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/Organisation access denied/i)

    listMock.mockResolvedValueOnce([OWNER])
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    await waitFor(() => expect(useMembershipStore.getState().status).toBe('ready'))
  })
})

describe('MemberList permissions', () => {
  it('gives a viewer no controls at all', async () => {
    signInAs(OPERATOR.userId, 'viewer')
    render(<MemberList />)
    await waitFor(() => expect(useMembershipStore.getState().status).toBe('ready'))

    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.queryByRole('button', { name: /remove/i })).toBeNull()
    expect(screen.getByText(/view members but not change them/i)).toBeTruthy()
  })

  it('never offers controls against the owner membership', async () => {
    signInAs(ADMIN.userId, 'admin')
    render(<MemberList />)
    await waitFor(() => expect(useMembershipStore.getState().status).toBe('ready'))

    expect(screen.queryByRole('combobox', { name: new RegExp(emailOf(OWNER)) })).toBeNull()
  })

  it('stops an admin editing another admin', async () => {
    // A third admin, so the ADMIN row is somebody else rather than "self".
    signInAs('user-other-admin', 'admin')
    render(<MemberList />)
    await waitFor(() => expect(useMembershipStore.getState().status).toBe('ready'))

    expect(screen.queryByRole('combobox', { name: new RegExp(emailOf(ADMIN)) })).toBeNull()
    expect(screen.getByRole('combobox', { name: new RegExp(emailOf(OPERATOR)) })).toBeTruthy()
  })

  it('does not offer an admin the option to mint another admin', async () => {
    signInAs(ADMIN.userId, 'admin')
    render(<MemberList />)
    await waitFor(() => expect(useMembershipStore.getState().status).toBe('ready'))

    const select = screen.getByRole('combobox', { name: new RegExp(emailOf(OPERATOR)) })
    const options = Array.from(select.querySelectorAll('option')).map((option) => option.value)
    expect(options).toEqual(['operator', 'viewer'])
  })

  it('lets an owner promote a member to admin', async () => {
    await renderAsOwner()

    const select = screen.getByRole('combobox', { name: new RegExp(emailOf(OPERATOR)) })
    const options = Array.from(select.querySelectorAll('option')).map((option) => option.value)
    expect(options).toEqual(['admin', 'operator', 'viewer'])
  })

  it('does not offer controls against the signed-in user themselves', async () => {
    signInAs(ADMIN.userId, 'admin')
    render(<MemberList />)
    await waitFor(() => expect(useMembershipStore.getState().status).toBe('ready'))

    expect(screen.queryByRole('combobox', { name: new RegExp(emailOf(ADMIN)) })).toBeNull()
  })
})

describe('MemberList actions', () => {
  it('changes a role', async () => {
    await renderAsOwner()
    updateRoleMock.mockResolvedValue({ ...OPERATOR, role: 'viewer' })

    fireEvent.change(screen.getByRole('combobox', { name: new RegExp(emailOf(OPERATOR)) }), {
      target: { value: 'viewer' },
    })

    await waitFor(() =>
      expect(updateRoleMock).toHaveBeenCalledWith(ORG_ID, OPERATOR.userId, 'viewer'),
    )
  })

  it('removes a member', async () => {
    await renderAsOwner()
    removeMock.mockResolvedValue(undefined)

    fireEvent.click(screen.getAllByRole('button', { name: /^remove$/i })[0]!)

    await waitFor(() => expect(removeMock).toHaveBeenCalledTimes(1))
  })

  it('reports a refused action without losing the list', async () => {
    await renderAsOwner()
    removeMock.mockRejectedValue(
      new ApiError({ message: 'Membership changed before removal', status: 409, code: 'MEMBERSHIP_CHANGED' }),
    )

    fireEvent.click(screen.getAllByRole('button', { name: /^remove$/i })[0]!)

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/Membership changed before removal/i)
    expect(screen.getByText(emailOf(OPERATOR))).toBeTruthy()
  })
})

describe('MemberList ownership transfer', () => {
  it('confirms before handing over ownership', async () => {
    await renderAsOwner()
    transferMock.mockResolvedValue({
      previousOwner: { ...OWNER, role: 'admin' },
      newOwner: { ...OPERATOR, role: 'owner' },
    })

    fireEvent.click(screen.getAllByRole('button', { name: /make owner/i })[0]!)
    expect(transferMock).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /confirm: hand over/i }))
    await waitFor(() => expect(transferMock).toHaveBeenCalledTimes(1))
  })

  it('can be cancelled without transferring', async () => {
    await renderAsOwner()

    fireEvent.click(screen.getAllByRole('button', { name: /make owner/i })[0]!)
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }))

    expect(transferMock).not.toHaveBeenCalled()
    expect(screen.getAllByRole('button', { name: /make owner/i }).length).toBeGreaterThan(0)
  })

  it('is not offered to an admin', async () => {
    signInAs(ADMIN.userId, 'admin')
    render(<MemberList />)
    await waitFor(() => expect(useMembershipStore.getState().status).toBe('ready'))

    expect(screen.queryByRole('button', { name: /make owner/i })).toBeNull()
  })
})

describe('MemberList with no recorded email', () => {
  // The API's membership document allows a null email, so the row must not
  // render "null" or label a control "Role for null".
  const ANONYMOUS = member('user-anon', 'operator', null)

  it('falls back to a readable label instead of rendering null', async () => {
    listMock.mockResolvedValue([OWNER, ANONYMOUS])
    await renderAsOwner()

    expect(screen.queryByText('null')).toBeNull()
    expect(screen.getByText(/no email recorded/i)).toBeTruthy()
  })

  it('still labels the role control unambiguously', async () => {
    listMock.mockResolvedValue([OWNER, ANONYMOUS])
    await renderAsOwner()

    const select = screen.getByRole('combobox', { name: /role for/i })
    expect(select.getAttribute('aria-label')).not.toMatch(/null/)
  })

  it('still allows the row to be managed', async () => {
    listMock.mockResolvedValue([OWNER, ANONYMOUS])
    await renderAsOwner()
    removeMock.mockResolvedValue(undefined)

    fireEvent.click(screen.getByRole('button', { name: /^remove$/i }))
    await waitFor(() => expect(removeMock).toHaveBeenCalledWith(ORG_ID, ANONYMOUS.userId))
  })
})
