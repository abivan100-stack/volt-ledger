import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '../useSessionStore'
import { ApiError } from '../../api/errors'
import { notifyUnauthenticated } from '../../api/unauthenticated'
import type { Session } from '../../api/session'

const { fetchSessionMock, signOutMock, signInMock } = vi.hoisted(() => ({
  fetchSessionMock: vi.fn(),
  signOutMock: vi.fn(),
  signInMock: vi.fn(),
}))

vi.mock('../../api/session', () => ({
  fetchSession: fetchSessionMock,
  signOut: signOutMock,
}))

vi.mock('../../api/auth', () => ({
  signInWithEmail: signInMock,
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
  signInMock.mockReset()
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

  it('does not resurrect a session response that predates a successful sign-out', async () => {
    let release: (value: Session | null) => void = () => {}
    fetchSessionMock.mockReturnValue(new Promise<Session | null>((resolve) => { release = resolve }))
    const pendingRestore = useSessionStore.getState().restore()

    signOutMock.mockResolvedValue(undefined)
    await useSessionStore.getState().signOut()
    release(SESSION)
    await pendingRestore

    expect(useSessionStore.getState().status).toBe('anonymous')
    expect(useSessionStore.getState().user).toBeNull()
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

describe('unauthenticated API responses', () => {
  it('expires the session when any request reports a 401', async () => {
    fetchSessionMock.mockResolvedValue(SESSION)
    await useSessionStore.getState().restore()

    notifyUnauthenticated()

    const state = useSessionStore.getState()
    expect(state.status).toBe('anonymous')
    expect(state.user).toBeNull()
    expect(state.expired).toBe(true)
  })

  it('leaves an anonymous visitor unchanged', async () => {
    fetchSessionMock.mockResolvedValue(null)
    await useSessionStore.getState().restore()

    notifyUnauthenticated()

    const state = useSessionStore.getState()
    expect(state.status).toBe('anonymous')
    expect(state.expired).toBe(false)
  })
})

describe('signIn', () => {
  it('authenticates and loads the resulting session', async () => {
    signInMock.mockResolvedValue(undefined)
    fetchSessionMock.mockResolvedValue(SESSION)

    await useSessionStore.getState().signIn({ email: 'asha@example.com', password: 'a-long-password' })

    expect(signInMock).toHaveBeenCalledWith({ email: 'asha@example.com', password: 'a-long-password' })
    const state = useSessionStore.getState()
    expect(state.status).toBe('authenticated')
    expect(state.user).toEqual(SESSION.user)
  })

  it('clears a previous expiry notice on a successful sign-in', async () => {
    fetchSessionMock.mockResolvedValue(SESSION)
    await useSessionStore.getState().restore()
    useSessionStore.getState().expire()
    expect(useSessionStore.getState().expired).toBe(true)

    signInMock.mockResolvedValue(undefined)
    await useSessionStore.getState().signIn({ email: 'asha@example.com', password: 'a-long-password' })
    expect(useSessionStore.getState().expired).toBe(false)
  })

  it('rejects to the caller and leaves the visitor signed out on bad credentials', async () => {
    fetchSessionMock.mockResolvedValue(null)
    await useSessionStore.getState().restore()
    fetchSessionMock.mockClear()

    signInMock.mockRejectedValue(
      new ApiError({ message: 'Invalid email or password', status: 401, code: 'INVALID_EMAIL_OR_PASSWORD' }),
    )

    await expect(
      useSessionStore.getState().signIn({ email: 'asha@example.com', password: 'wrong' }),
    ).rejects.toMatchObject({ code: 'INVALID_EMAIL_OR_PASSWORD' })

    const state = useSessionStore.getState()
    expect(state.status).toBe('anonymous')
    expect(state.user).toBeNull()
    // A refused credential is not worth a round trip to /api/v1/me.
    expect(fetchSessionMock).not.toHaveBeenCalled()
  })

  it('rejects when the address has not been verified yet', async () => {
    fetchSessionMock.mockResolvedValue(null)
    await useSessionStore.getState().restore()

    signInMock.mockRejectedValue(
      new ApiError({ message: 'Email not verified', status: 403, code: 'EMAIL_NOT_VERIFIED' }),
    )

    await expect(
      useSessionStore.getState().signIn({ email: 'asha@example.com', password: 'a-long-password' }),
    ).rejects.toMatchObject({ status: 403 })
    expect(useSessionStore.getState().status).toBe('anonymous')
    expect(useSessionStore.getState().user).toBeNull()
  })

  it('does not fabricate a status when sign-in fails before anything is known', async () => {
    signInMock.mockRejectedValue(
      new ApiError({ message: 'Invalid email or password', status: 401, code: 'INVALID_EMAIL_OR_PASSWORD' }),
    )

    await expect(
      useSessionStore.getState().signIn({ email: 'asha@example.com', password: 'wrong' }),
    ).rejects.toMatchObject({ status: 401 })

    const state = useSessionStore.getState()
    expect(state.status).toBe('unknown')
    expect(state.user).toBeNull()
  })
})
