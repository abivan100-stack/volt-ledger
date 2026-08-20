// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AcceptInvitation from '../AcceptInvitation'
import { useOrganisationStore } from '../../../store/useOrganisationStore'
import { useSessionStore } from '../../../store/useSessionStore'
import { ApiError } from '../../../api/errors'

const { acceptMock, fetchSessionMock, listOrganisationsMock } = vi.hoisted(() => ({
  acceptMock: vi.fn(),
  fetchSessionMock: vi.fn(),
  listOrganisationsMock: vi.fn(),
}))

vi.mock('../../../api/invitations', () => ({
  acceptInvitation: acceptMock,
  listInvitations: vi.fn(),
  createInvitation: vi.fn(),
  revokeInvitation: vi.fn(),
}))

vi.mock('../../../api/session', () => ({
  fetchSession: fetchSessionMock,
  signOut: vi.fn(),
}))

vi.mock('../../../api/auth', () => ({
  signInWithEmail: vi.fn(),
  signUpWithEmail: vi.fn(),
}))

vi.mock('../../../api/organisations', () => ({
  listOrganisations: listOrganisationsMock,
  createOrganisation: vi.fn(),
  archiveOrganisation: vi.fn(),
}))

const VERIFIED_SESSION = {
  user: { id: 'user-1', name: 'Asha', email: 'asha@example.com', emailVerified: true },
  session: { id: 'session-1', expiresAt: '2026-09-01T00:00:00.000Z' },
}

const pristineSession = useSessionStore.getState()
const pristineOrganisations = useOrganisationStore.getState()

beforeEach(() => {
  useSessionStore.setState(pristineSession, true)
  useOrganisationStore.setState(pristineOrganisations, true)
  acceptMock.mockReset()
  fetchSessionMock.mockReset()
  listOrganisationsMock.mockReset()
  listOrganisationsMock.mockResolvedValue([])
  fetchSessionMock.mockResolvedValue(VERIFIED_SESSION)
})

afterEach(() => {
  cleanup()
})

function renderPage(token: string | null = 'token-abc') {
  return render(
    <MemoryRouter>
      <AcceptInvitation token={token} />
    </MemoryRouter>,
  )
}

describe('AcceptInvitation without a token', () => {
  it('explains that the link is incomplete', () => {
    renderPage(null)
    expect(screen.getByRole('alert').textContent).toMatch(/missing its invitation token/i)
    expect(acceptMock).not.toHaveBeenCalled()
  })
})

describe('AcceptInvitation when signed out', () => {
  it('sends the visitor to sign in first', async () => {
    fetchSessionMock.mockResolvedValue(null)
    renderPage()

    await waitFor(() => expect(useSessionStore.getState().status).toBe('anonymous'))
    expect(screen.getByRole('link', { name: /sign in/i }).getAttribute('href')).toBe('/account')
    expect(screen.queryByRole('button', { name: /accept invitation/i })).toBeNull()
  })
})

describe('AcceptInvitation when signed in', () => {
  it('does not accept anything until the visitor asks', async () => {
    renderPage()
    await screen.findByRole('button', { name: /accept invitation/i })
    expect(acceptMock).not.toHaveBeenCalled()
  })

  it('shows which address the invitation will be matched against', async () => {
    renderPage()
    expect((await screen.findByText(/asha@example\.com/)).textContent).toBeTruthy()
  })

  it('accepts the invitation and reports the role granted', async () => {
    acceptMock.mockResolvedValue({
      organisationId: 'org-a',
      membershipId: 'membership-1',
      role: 'operator',
    })
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: /accept invitation/i }))

    const confirmation = await screen.findByRole('status')
    expect(confirmation.textContent).toMatch(/joined this organisation/i)
    expect(confirmation.textContent).toMatch(/Operator/)
    expect(acceptMock).toHaveBeenCalledWith('token-abc')
  })

  it('reloads the organisation list so the new membership appears', async () => {
    acceptMock.mockResolvedValue({
      organisationId: 'org-a',
      membershipId: 'membership-1',
      role: 'viewer',
    })
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: /accept invitation/i }))
    await waitFor(() => expect(listOrganisationsMock).toHaveBeenCalled())
  })

  it('warns when the address still needs verifying', async () => {
    fetchSessionMock.mockResolvedValue({
      ...VERIFIED_SESSION,
      user: { ...VERIFIED_SESSION.user, emailVerified: false },
    })
    renderPage()

    expect((await screen.findByText(/verify your email address first/i)).textContent).toBeTruthy()
  })

  it('reports an invitation issued to a different address', async () => {
    acceptMock.mockRejectedValue(
      new ApiError({
        message: 'This invitation belongs to a different email address',
        status: 403,
        code: 'INVITATION_EMAIL_MISMATCH',
      }),
    )
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: /accept invitation/i }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/different email address/i)
  })

  it('reports an expired or unknown invitation', async () => {
    acceptMock.mockRejectedValue(
      new ApiError({ message: 'Invitation is invalid or expired', status: 400, code: 'INVITATION_INVALID' }),
    )
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: /accept invitation/i }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/invalid or expired/i)
  })

  it('reports an existing membership', async () => {
    acceptMock.mockRejectedValue(
      new ApiError({ message: 'You already belong to this organisation', status: 409, code: 'MEMBERSHIP_EXISTS' }),
    )
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: /accept invitation/i }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/already belong/i)
  })

  it('leaves the control usable after a failure', async () => {
    acceptMock.mockRejectedValueOnce(
      new ApiError({ message: 'Could not reach the Volt API', status: 0, code: 'NETWORK_ERROR' }),
    )
    renderPage()

    const button = await screen.findByRole('button', { name: /accept invitation/i })
    fireEvent.click(button)
    await screen.findByRole('alert')

    expect((button as HTMLButtonElement).disabled).toBe(false)
  })
})
