import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '../useSessionStore'
import { ApiError } from '../../api/errors'
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
  signOutMock.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('initial state', () => {
  it('starts unknown with no user', () => {
    const state = useSessionStore.getState()
    expect(state.status).toBe('unknown')
    expect(state.user).toBeNull()
    expect(state.expiresAt).toBeNull()
    expect(state.error).toBeNull()
    expect(state.expired).toBe(false)
  })
})

describe('restore', () => {
  it('reports the signed-in user', async () => {
    fetchSessionMock.mockResolvedValue(SESSION)
    await useSessionStore.getState().restore()

    const state = useSessionStore.getState()
    expect(state.status).toBe('authenticated')
    expect(state.user).toEqual(SESSION.user)
    expect(state.expiresAt).toBe('2026-09-01T00:00:00.000Z')
    expect(state.error).toBeNull()
  })

  it('marks the store as restoring while the request is in flight', async () => {
    let release: (value: Session | null) => void = () => {}
    fetchSessionMock.mockReturnValue(new Promise<Session | null>((resolve) => { release = resolve }))

    const pending = useSessionStore.getState().restore()
    expect(useSessionStore.getState().status).toBe('restoring')

    release(SESSION)
    await pending
    expect(useSessionStore.getState().status).toBe('authenticated')
  })

  it('reports an anonymous visitor when there is no session', async () => {
    fetchSessionMock.mockResolvedValue(null)
    await useSessionStore.getState().restore()

    const state = useSessionStore.getState()
    expect(state.status).toBe('anonymous')
    expect(state.user).toBeNull()
    expect(state.expired).toBe(false)
  })

  it('records a failure without claiming the visitor is signed out', async () => {
    fetchSessionMock.mockRejectedValue(
      new ApiError({ message: 'Could not reach the Volt API', status: 0, code: 'NETWORK_ERROR' }),
    )
    await useSessionStore.getState().restore()

    const state = useSessionStore.getState()
    expect(state.status).toBe('error')
    expect(state.user).toBeNull()
    expect(state.error).toBe('Could not reach the Volt API')
  })

  it('reuses one in-flight request when called concurrently', async () => {
    fetchSessionMock.mockResolvedValue(SESSION)
    await Promise.all([
      useSessionStore.getState().restore(),
      useSessionStore.getState().restore(),
      useSessionStore.getState().restore(),
    ])
    expect(fetchSessionMock).toHaveBeenCalledTimes(1)
  })

  it('allows a retry after a failed restore', async () => {
    fetchSessionMock.mockRejectedValueOnce(
      new ApiError({ message: 'Could not reach the Volt API', status: 0, code: 'NETWORK_ERROR' }),
    )
    await useSessionStore.getState().restore()
    expect(useSessionStore.getState().status).toBe('error')

    fetchSessionMock.mockResolvedValueOnce(SESSION)
    await useSessionStore.getState().restore()
    expect(useSessionStore.getState().status).toBe('authenticated')
    expect(fetchSessionMock).toHaveBeenCalledTimes(2)
  })

  it('clears a previous expiry notice when the visitor signs back in', async () => {
    fetchSessionMock.mockResolvedValue(SESSION)
    await useSessionStore.getState().restore()
    useSessionStore.getState().expire()
    expect(useSessionStore.getState().expired).toBe(true)

    await useSessionStore.getState().restore()
    expect(useSessionStore.getState().expired).toBe(false)
    expect(useSessionStore.getState().status).toBe('authenticated')
  })
})

describe('signOut', () => {
  it('clears the session after a successful sign-out', async () => {
    fetchSessionMock.mockResolvedValue(SESSION)
    await useSessionStore.getState().restore()

    signOutMock.mockResolvedValue(undefined)
    await useSessionStore.getState().signOut()

    const state = useSessionStore.getState()
    expect(signOutMock).toHaveBeenCalledTimes(1)
    expect(state.status).toBe('anonymous')
    expect(state.user).toBeNull()
    expect(state.expiresAt).toBeNull()
    expect(state.expired).toBe(false)
  })

  it('keeps the visitor signed in when sign-out cannot reach the server', async () => {
    fetchSessionMock.mockResolvedValue(SESSION)
    await useSessionStore.getState().restore()

    signOutMock.mockRejectedValue(
      new ApiError({ message: 'Could not reach the Volt API', status: 0, code: 'NETWORK_ERROR' }),
    )
    await useSessionStore.getState().signOut()

    const state = useSessionStore.getState()
    expect(state.status).toBe('authenticated')
    expect(state.user).toEqual(SESSION.user)
    expect(state.error).toBe('Could not reach the Volt API')
  })
})

describe('expire', () => {
  it('drops to anonymous and flags the session as expired', async () => {
    fetchSessionMock.mockResolvedValue(SESSION)
    await useSessionStore.getState().restore()

    useSessionStore.getState().expire()

    const state = useSessionStore.getState()
    expect(state.status).toBe('anonymous')
    expect(state.user).toBeNull()
    expect(state.expiresAt).toBeNull()
    expect(state.expired).toBe(true)
  })

  it('does not flag an expiry for a visitor who was never signed in', async () => {
    fetchSessionMock.mockResolvedValue(null)
    await useSessionStore.getState().restore()

    useSessionStore.getState().expire()
    expect(useSessionStore.getState().expired).toBe(false)
  })
})

describe('dismissExpiryNotice', () => {
  it('clears the expiry flag without changing status', async () => {
    fetchSessionMock.mockResolvedValue(SESSION)
    await useSessionStore.getState().restore()
    useSessionStore.getState().expire()

    useSessionStore.getState().dismissExpiryNotice()

    const state = useSessionStore.getState()
    expect(state.expired).toBe(false)
    expect(state.status).toBe('anonymous')
  })
})
