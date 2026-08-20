import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useOrganisationStore } from '../useOrganisationStore'
import { useSessionStore } from '../useSessionStore'
import { ApiError } from '../../api/errors'
import type { Organisation } from '../../api/organisations'

const { listMock, createMock, archiveMock } = vi.hoisted(() => ({
  listMock: vi.fn(),
  createMock: vi.fn(),
  archiveMock: vi.fn(),
}))

vi.mock('../../api/organisations', () => ({
  listOrganisations: listMock,
  createOrganisation: createMock,
  archiveOrganisation: archiveMock,
}))

function organisation(id: string, overrides: Partial<Organisation> = {}): Organisation {
  return {
    id,
    name: `Org ${id}`,
    slug: `org-${id}`,
    role: 'owner',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  }
}

const FIRST = organisation('a')
const SECOND = organisation('b', { role: 'viewer' })

const pristineOrganisations = useOrganisationStore.getState()
const pristineSession = useSessionStore.getState()

beforeEach(() => {
  useOrganisationStore.setState(pristineOrganisations, true)
  useSessionStore.setState(pristineSession, true)
  listMock.mockReset()
  createMock.mockReset()
  archiveMock.mockReset()
})

describe('initial state', () => {
  it('starts empty with nothing selected', () => {
    const state = useOrganisationStore.getState()
    expect(state.status).toBe('unknown')
    expect(state.organisations).toEqual([])
    expect(state.selectedId).toBeNull()
    expect(state.error).toBeNull()
  })
})

describe('load', () => {
  it('stores the organisations and selects the first', async () => {
    listMock.mockResolvedValue([FIRST, SECOND])
    await useOrganisationStore.getState().load()

    const state = useOrganisationStore.getState()
    expect(state.status).toBe('ready')
    expect(state.organisations).toEqual([FIRST, SECOND])
    expect(state.selectedId).toBe(FIRST.id)
  })

  it('is ready with nothing selected when the user has no organisations', async () => {
    listMock.mockResolvedValue([])
    await useOrganisationStore.getState().load()

    const state = useOrganisationStore.getState()
    expect(state.status).toBe('ready')
    expect(state.selectedId).toBeNull()
  })

  it('keeps an existing selection that is still present', async () => {
    listMock.mockResolvedValue([FIRST, SECOND])
    await useOrganisationStore.getState().load()
    useOrganisationStore.getState().select(SECOND.id)

    listMock.mockResolvedValue([FIRST, SECOND])
    await useOrganisationStore.getState().load()
    expect(useOrganisationStore.getState().selectedId).toBe(SECOND.id)
  })

  it('falls back to the first organisation when the selection disappeared', async () => {
    listMock.mockResolvedValue([FIRST, SECOND])
    await useOrganisationStore.getState().load()
    useOrganisationStore.getState().select(SECOND.id)

    listMock.mockResolvedValue([FIRST])
    await useOrganisationStore.getState().load()
    expect(useOrganisationStore.getState().selectedId).toBe(FIRST.id)
  })

  it('marks the store as loading while the request is in flight', async () => {
    let release: (value: Organisation[]) => void = () => {}
    listMock.mockReturnValue(
      new Promise<Organisation[]>((resolve) => {
        release = resolve
      }),
    )

    const pending = useOrganisationStore.getState().load()
    expect(useOrganisationStore.getState().status).toBe('loading')

    release([FIRST])
    await pending
    expect(useOrganisationStore.getState().status).toBe('ready')
  })

  it('records a failure and keeps the list retryable', async () => {
    listMock.mockRejectedValue(
      new ApiError({ message: 'Could not reach the Volt API', status: 0, code: 'NETWORK_ERROR' }),
    )
    await useOrganisationStore.getState().load()

    expect(useOrganisationStore.getState().status).toBe('error')
    expect(useOrganisationStore.getState().error).toBe('Could not reach the Volt API')

    listMock.mockResolvedValue([FIRST])
    await useOrganisationStore.getState().load()
    expect(useOrganisationStore.getState().status).toBe('ready')
  })

  it('reuses one in-flight request when called concurrently', async () => {
    listMock.mockResolvedValue([FIRST])
    await Promise.all([
      useOrganisationStore.getState().load(),
      useOrganisationStore.getState().load(),
    ])
    expect(listMock).toHaveBeenCalledTimes(1)
  })
})

describe('select', () => {
  it('changes the selection to a known organisation', async () => {
    listMock.mockResolvedValue([FIRST, SECOND])
    await useOrganisationStore.getState().load()

    useOrganisationStore.getState().select(SECOND.id)
    expect(useOrganisationStore.getState().selectedId).toBe(SECOND.id)
  })

  it('ignores an unknown organisation id', async () => {
    listMock.mockResolvedValue([FIRST])
    await useOrganisationStore.getState().load()

    useOrganisationStore.getState().select('missing')
    expect(useOrganisationStore.getState().selectedId).toBe(FIRST.id)
  })

  it('clears the selection when passed null', async () => {
    listMock.mockResolvedValue([FIRST])
    await useOrganisationStore.getState().load()

    useOrganisationStore.getState().select(null)
    expect(useOrganisationStore.getState().selectedId).toBeNull()
  })
})

describe('selected', () => {
  it('resolves the selected organisation', async () => {
    listMock.mockResolvedValue([FIRST, SECOND])
    await useOrganisationStore.getState().load()
    useOrganisationStore.getState().select(SECOND.id)

    expect(useOrganisationStore.getState().selected()).toEqual(SECOND)
  })

  it('is null when nothing is selected', () => {
    expect(useOrganisationStore.getState().selected()).toBeNull()
  })
})

describe('create', () => {
  it('adds the new organisation and selects it', async () => {
    listMock.mockResolvedValue([FIRST])
    await useOrganisationStore.getState().load()

    createMock.mockResolvedValue(SECOND)
    const created = await useOrganisationStore
      .getState()
      .create({ name: SECOND.name, slug: SECOND.slug })

    const state = useOrganisationStore.getState()
    expect(created).toEqual(SECOND)
    expect(state.organisations).toEqual([FIRST, SECOND])
    expect(state.selectedId).toBe(SECOND.id)
  })

  it('propagates a slug conflict to the caller without touching the list', async () => {
    listMock.mockResolvedValue([FIRST])
    await useOrganisationStore.getState().load()

    createMock.mockRejectedValue(
      new ApiError({
        message: 'An organisation with this slug already exists',
        status: 409,
        code: 'ORGANISATION_SLUG_CONFLICT',
      }),
    )

    await expect(
      useOrganisationStore.getState().create({ name: 'Duplicate', slug: 'org-a' }),
    ).rejects.toMatchObject({ code: 'ORGANISATION_SLUG_CONFLICT' })

    const state = useOrganisationStore.getState()
    expect(state.organisations).toEqual([FIRST])
    expect(state.status).toBe('ready')
  })
})

describe('archive', () => {
  it('removes the organisation and selects the next one', async () => {
    listMock.mockResolvedValue([FIRST, SECOND])
    await useOrganisationStore.getState().load()

    archiveMock.mockResolvedValue(undefined)
    await useOrganisationStore.getState().archive(FIRST.id)

    const state = useOrganisationStore.getState()
    expect(archiveMock).toHaveBeenCalledWith(FIRST.id)
    expect(state.organisations).toEqual([SECOND])
    expect(state.selectedId).toBe(SECOND.id)
  })

  it('clears the selection when the last organisation is archived', async () => {
    listMock.mockResolvedValue([FIRST])
    await useOrganisationStore.getState().load()

    archiveMock.mockResolvedValue(undefined)
    await useOrganisationStore.getState().archive(FIRST.id)

    expect(useOrganisationStore.getState().organisations).toEqual([])
    expect(useOrganisationStore.getState().selectedId).toBeNull()
  })

  it('leaves the list untouched when archiving fails', async () => {
    listMock.mockResolvedValue([FIRST])
    await useOrganisationStore.getState().load()

    archiveMock.mockRejectedValue(
      new ApiError({
        message: 'Your role cannot perform this action',
        status: 403,
        code: 'ORGANISATION_ROLE_FORBIDDEN',
      }),
    )

    await expect(useOrganisationStore.getState().archive(FIRST.id)).rejects.toMatchObject({
      code: 'ORGANISATION_ROLE_FORBIDDEN',
    })
    expect(useOrganisationStore.getState().organisations).toEqual([FIRST])
  })
})

describe('session changes', () => {
  it('clears organisations when an authenticated session ends', async () => {
    useSessionStore.setState({ status: 'authenticated' })
    listMock.mockResolvedValue([FIRST])
    await useOrganisationStore.getState().load()
    expect(useOrganisationStore.getState().organisations).toEqual([FIRST])

    useSessionStore.getState().expire()

    const state = useOrganisationStore.getState()
    expect(state.status).toBe('unknown')
    expect(state.organisations).toEqual([])
    expect(state.selectedId).toBeNull()
  })

  it('leaves the list alone while the session stays authenticated', async () => {
    useSessionStore.setState({ status: 'authenticated' })
    listMock.mockResolvedValue([FIRST])
    await useOrganisationStore.getState().load()

    useSessionStore.setState({ error: 'unrelated' })
    expect(useOrganisationStore.getState().organisations).toEqual([FIRST])
  })
})
