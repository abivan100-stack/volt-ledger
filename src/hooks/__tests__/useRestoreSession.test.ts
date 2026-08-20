// @vitest-environment happy-dom
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useRestoreSession } from '../useRestoreSession'
import { useSessionStore } from '../../store/useSessionStore'
import type { Session } from '../../api/session'

const { fetchSessionMock, signOutMock } = vi.hoisted(() => ({
  fetchSessionMock: vi.fn(),
  signOutMock: vi.fn(),
}))

vi.mock('../../api/session', () => ({
  fetchSession: fetchSessionMock,
  signOut: signOutMock,
}))

const SESSION: Session = {
  user: { id: 'user-1', name: 'Asha', email: 'asha@example.com', emailVerified: true },
  session: { id: 'session-1', expiresAt: '2026-09-01T00:00:00.000Z' },
}

const pristine = useSessionStore.getState()

beforeEach(() => {
  useSessionStore.setState(pristine, true)
  fetchSessionMock.mockReset()
  fetchSessionMock.mockResolvedValue(SESSION)
})

describe('useRestoreSession', () => {
  it('restores the session once on mount', async () => {
    renderHook(() => useRestoreSession())
    await waitFor(() => expect(useSessionStore.getState().status).toBe('authenticated'))
    expect(fetchSessionMock).toHaveBeenCalledTimes(1)
  })

  it('does not refetch when the component re-renders', async () => {
    const { rerender } = renderHook(() => useRestoreSession())
    await waitFor(() => expect(useSessionStore.getState().status).toBe('authenticated'))
    rerender()
    rerender()
    expect(fetchSessionMock).toHaveBeenCalledTimes(1)
  })

  it('returns the current session state', async () => {
    const { result } = renderHook(() => useRestoreSession())
    await waitFor(() => expect(result.current.status).toBe('authenticated'))
    expect(result.current.user).toEqual(SESSION.user)
  })

  it('leaves an already-restored session untouched', async () => {
    useSessionStore.setState({ status: 'anonymous' })
    renderHook(() => useRestoreSession())
    await waitFor(() => expect(fetchSessionMock).not.toHaveBeenCalled())
    expect(useSessionStore.getState().status).toBe('anonymous')
  })
})
