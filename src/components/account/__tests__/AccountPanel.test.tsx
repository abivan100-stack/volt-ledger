// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import AccountPanel from '../AccountPanel'
import { useSessionStore } from '../../../store/useSessionStore'
import { ApiError } from '../../../api/errors'

const { fetchSessionMock, signOutMock, isApiConfiguredMock } = vi.hoisted(() => ({
  fetchSessionMock: vi.fn(),
  signOutMock: vi.fn(),
  isApiConfiguredMock: vi.fn(),
}))

vi.mock('../../../api/session', () => ({
  fetchSession: fetchSessionMock,
  signOut: signOutMock,
}))

vi.mock('../../../api/auth', () => ({
  signInWithEmail: vi.fn(),
  signUpWithEmail: vi.fn(),
}))

vi.mock('../../../api/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../api/config')>()),
  isApiConfigured: isApiConfiguredMock,
}))

const SESSION = {
  user: { id: 'user-1', name: 'Asha', email: 'asha@example.com', emailVerified: true },
  session: { id: 'session-1', expiresAt: '2026-09-01T00:00:00.000Z' },
}

const pristine = useSessionStore.getState()

beforeEach(() => {
  useSessionStore.setState(pristine, true)
  fetchSessionMock.mockReset()
  signOutMock.mockReset()
  isApiConfiguredMock.mockReset()
  isApiConfiguredMock.mockReturnValue(true)
})

afterEach(() => {
  cleanup()
})

describe('AccountPanel without a configured API', () => {
  it('explains that the build is demo-only instead of offering a broken form', () => {
    isApiConfiguredMock.mockReturnValue(false)
    render(<AccountPanel />)

    expect(screen.getByRole('status').textContent).toMatch(/demo/i)
    expect(screen.queryByLabelText(/password/i)).toBeNull()
    expect(fetchSessionMock).not.toHaveBeenCalled()
  })
})

describe('AccountPanel while restoring', () => {
  it('shows a loading state', async () => {
    fetchSessionMock.mockReturnValue(new Promise(() => {}))
    render(<AccountPanel />)

    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/checking/i))
  })
})

describe('AccountPanel when signed out', () => {
  beforeEach(() => {
    fetchSessionMock.mockResolvedValue(null)
  })

  it('offers the sign-in form first', async () => {
    render(<AccountPanel />)
    await waitFor(() => expect(useSessionStore.getState().status).toBe('anonymous'))
    expect(screen.getByRole('button', { name: /^sign in$/i })).toBeTruthy()
  })

  it('switches to the sign-up form on request', async () => {
    render(<AccountPanel />)
    await waitFor(() => expect(useSessionStore.getState().status).toBe('anonymous'))

    fireEvent.click(screen.getByRole('tab', { name: /create account/i }))
    expect(screen.getByRole('button', { name: /create account/i })).toBeTruthy()
    expect(screen.getByLabelText(/name/i)).toBeTruthy()
  })

  it('does not claim the session expired for a first-time visitor', async () => {
    render(<AccountPanel />)
    await waitFor(() => expect(useSessionStore.getState().status).toBe('anonymous'))
    expect(screen.queryByText(/session expired/i)).toBeNull()
  })
})

describe('AccountPanel after a session expires', () => {
  it('explains the drop-out and lets the visitor dismiss it', async () => {
    fetchSessionMock.mockResolvedValue(SESSION)
    render(<AccountPanel />)
    await waitFor(() => expect(useSessionStore.getState().status).toBe('authenticated'))

    act(() => {
      useSessionStore.getState().expire()
    })

    const notice = await screen.findByRole('alert')
    expect(notice.textContent).toMatch(/expired/i)

    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  })
})

describe('AccountPanel when signed in', () => {
  beforeEach(() => {
    fetchSessionMock.mockResolvedValue(SESSION)
  })

  it('shows who is signed in', async () => {
    render(<AccountPanel />)
    expect((await screen.findByText(/asha@example\.com/)).textContent).toBeTruthy()
  })

  it('signs the visitor out', async () => {
    signOutMock.mockResolvedValue(undefined)
    render(<AccountPanel />)
    await waitFor(() => expect(useSessionStore.getState().status).toBe('authenticated'))

    fireEvent.click(screen.getByRole('button', { name: /sign out/i }))

    await waitFor(() => expect(useSessionStore.getState().status).toBe('anonymous'))
    expect(signOutMock).toHaveBeenCalledTimes(1)
  })

  it('flags an address that still needs verifying', async () => {
    fetchSessionMock.mockResolvedValue({
      ...SESSION,
      user: { ...SESSION.user, emailVerified: false },
    })
    render(<AccountPanel />)

    expect((await screen.findByText(/unverified/i)).textContent).toBeTruthy()
  })
})

describe('AccountPanel when the session cannot be determined', () => {
  it('offers a retry that restores again', async () => {
    fetchSessionMock.mockRejectedValueOnce(
      new ApiError({ message: 'Could not reach the Volt API', status: 0, code: 'NETWORK_ERROR' }),
    )
    render(<AccountPanel />)

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/Could not reach the Volt API/i)

    fetchSessionMock.mockResolvedValueOnce(SESSION)
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))

    await waitFor(() => expect(useSessionStore.getState().status).toBe('authenticated'))
  })
})
