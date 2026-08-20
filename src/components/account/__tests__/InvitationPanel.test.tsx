// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import InvitationPanel from '../InvitationPanel'
import { useInvitationStore } from '../../../store/useInvitationStore'
import { useOrganisationStore } from '../../../store/useOrganisationStore'
import { ApiError } from '../../../api/errors'
import type { Invitation } from '../../../api/invitations'
import type { MembershipRole } from '../../../lib/permissions'

const { listMock, createMock, revokeMock } = vi.hoisted(() => ({
  listMock: vi.fn(),
  createMock: vi.fn(),
  revokeMock: vi.fn(),
}))

vi.mock('../../../api/invitations', () => ({
  listInvitations: listMock,
  createInvitation: createMock,
  revokeInvitation: revokeMock,
  acceptInvitation: vi.fn(),
}))

vi.mock('../../../api/organisations', () => ({
  listOrganisations: vi.fn(async () => []),
  createOrganisation: vi.fn(),
  archiveOrganisation: vi.fn(),
}))

const ORG_ID = 'org-a'

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

function selectOrganisationAs(role: MembershipRole): void {
  useOrganisationStore.setState({
    status: 'ready',
    organisations: [
      {
        id: ORG_ID,
        name: 'Nolambur Microgrid',
        slug: 'nolambur-microgrid',
        role,
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z',
      },
    ],
    selectedId: ORG_ID,
  })
}

beforeEach(() => {
  useInvitationStore.setState(pristineInvitations, true)
  useOrganisationStore.setState(pristineOrganisations, true)
  listMock.mockReset()
  createMock.mockReset()
  revokeMock.mockReset()
  listMock.mockResolvedValue([PENDING])
})

afterEach(() => {
  cleanup()
})

async function renderAs(role: MembershipRole): Promise<void> {
  selectOrganisationAs(role)
  render(<InvitationPanel />)
  await waitFor(() => expect(useInvitationStore.getState().status).toBe('ready'))
}

describe('InvitationPanel visibility', () => {
  it('renders nothing without a selected organisation', () => {
    const { container } = render(<InvitationPanel />)
    expect(container.textContent).toBe('')
    expect(listMock).not.toHaveBeenCalled()
  })

  it('renders nothing for an operator, who cannot read the route', () => {
    selectOrganisationAs('operator')
    const { container } = render(<InvitationPanel />)
    expect(container.textContent).toBe('')
    expect(listMock).not.toHaveBeenCalled()
  })

  it('renders nothing for a viewer', () => {
    selectOrganisationAs('viewer')
    const { container } = render(<InvitationPanel />)
    expect(container.textContent).toBe('')
  })

  it('loads invitations for an owner', async () => {
    await renderAs('owner')
    expect(listMock).toHaveBeenCalledWith(ORG_ID)
    expect(screen.getByText(PENDING.email)).toBeTruthy()
  })
})

describe('InvitationPanel roles offered', () => {
  it('lets an owner invite an admin', async () => {
    await renderAs('owner')
    const select = screen.getByLabelText(/role/i)
    const options = Array.from(select.querySelectorAll('option')).map((option) => option.value)
    expect(options).toEqual(['admin', 'operator', 'viewer'])
  })

  it('does not let an admin invite another admin', async () => {
    await renderAs('admin')
    const select = screen.getByLabelText(/role/i)
    const options = Array.from(select.querySelectorAll('option')).map((option) => option.value)
    expect(options).toEqual(['operator', 'viewer'])
  })

  it('never offers the owner role', async () => {
    await renderAs('owner')
    const select = screen.getByLabelText(/role/i)
    const options = Array.from(select.querySelectorAll('option')).map((option) => option.value)
    expect(options).not.toContain('owner')
  })
})

describe('InvitationPanel sending', () => {
  it('sends an invitation and confirms delivery', async () => {
    await renderAs('owner')
    const created = invitation('invitation-2', { email: 'new@example.com', role: 'viewer' })
    createMock.mockResolvedValue(created)

    fireEvent.change(screen.getByLabelText(/invite by email/i), {
      target: { value: 'new@example.com' },
    })
    fireEvent.change(screen.getByLabelText(/role/i), { target: { value: 'viewer' } })
    fireEvent.click(screen.getByRole('button', { name: /send invitation/i }))

    await waitFor(() =>
      expect(createMock).toHaveBeenCalledWith(ORG_ID, { email: 'new@example.com', role: 'viewer' }),
    )
    const confirmation = await screen.findByRole('status')
    expect(confirmation.textContent).toMatch(/new@example\.com/)
  })

  it('clears the email field after a successful send', async () => {
    await renderAs('owner')
    createMock.mockResolvedValue(invitation('invitation-2', { email: 'new@example.com' }))

    const field = screen.getByLabelText(/invite by email/i) as HTMLInputElement
    fireEvent.change(field, { target: { value: 'new@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /send invitation/i }))

    await waitFor(() => expect(field.value).toBe(''))
  })

  it('reports an address that already has a pending invitation', async () => {
    await renderAs('owner')
    createMock.mockRejectedValue(
      new ApiError({
        message: 'An invitation is already pending for this email',
        status: 409,
        code: 'INVITATION_ALREADY_PENDING',
      }),
    )

    fireEvent.change(screen.getByLabelText(/invite by email/i), {
      target: { value: PENDING.email },
    })
    fireEvent.click(screen.getByRole('button', { name: /send invitation/i }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/already pending/i)
  })

  it('reports an undelivered invitation', async () => {
    await renderAs('owner')
    createMock.mockRejectedValue(
      new ApiError({
        message: 'Invitation email could not be sent',
        status: 503,
        code: 'INVITATION_DELIVERY_FAILED',
      }),
    )

    fireEvent.change(screen.getByLabelText(/invite by email/i), {
      target: { value: 'new@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: /send invitation/i }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/could not be sent/i)
  })

  it('does not send an empty address', async () => {
    await renderAs('owner')
    fireEvent.click(screen.getByRole('button', { name: /send invitation/i }))
    expect(createMock).not.toHaveBeenCalled()
  })
})

describe('InvitationPanel revoking', () => {
  it('revokes a pending invitation and keeps its record', async () => {
    await renderAs('owner')
    revokeMock.mockResolvedValue(undefined)

    fireEvent.click(screen.getByRole('button', { name: /revoke/i }))

    await waitFor(() => expect(revokeMock).toHaveBeenCalledWith(ORG_ID, PENDING.id))
    expect(screen.getByText('REVOKED')).toBeTruthy()
    expect(screen.getByText(PENDING.email)).toBeTruthy()
  })

  it('offers no revoke control for an invitation that is no longer pending', async () => {
    listMock.mockResolvedValue([invitation('invitation-3', { status: 'accepted' })])
    await renderAs('owner')

    expect(screen.queryByRole('button', { name: /revoke/i })).toBeNull()
    expect(screen.getByText('ACCEPTED')).toBeTruthy()
  })

  it('does not let an admin revoke an admin invitation', async () => {
    listMock.mockResolvedValue([invitation('invitation-4', { role: 'admin' })])
    await renderAs('admin')

    expect(screen.queryByRole('button', { name: /revoke/i })).toBeNull()
  })

  it('reports a refused revocation', async () => {
    await renderAs('owner')
    revokeMock.mockRejectedValue(
      new ApiError({ message: 'Invitation is no longer pending', status: 409, code: 'INVITATION_NOT_PENDING' }),
    )

    fireEvent.click(screen.getByRole('button', { name: /revoke/i }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/no longer pending/i)
  })
})

describe('InvitationPanel list failures', () => {
  it('offers a retry', async () => {
    listMock.mockReset()
    listMock.mockRejectedValueOnce(
      new ApiError({ message: 'Your role cannot perform this action', status: 403, code: 'ORGANISATION_ROLE_FORBIDDEN' }),
    )
    selectOrganisationAs('owner')
    render(<InvitationPanel />)

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/cannot perform this action/i)

    listMock.mockResolvedValueOnce([PENDING])
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    await waitFor(() => expect(useInvitationStore.getState().status).toBe('ready'))
  })

  it('reports an empty list plainly', async () => {
    listMock.mockResolvedValue([])
    await renderAs('owner')
    expect(screen.getByText(/no invitations have been issued/i)).toBeTruthy()
  })
})
