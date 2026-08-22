import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AUDIT_PAGE_SIZE, useAuditStore } from '../useAuditStore'
import { useOrganisationStore } from '../useOrganisationStore'
import { useSessionStore } from '../useSessionStore'
import { ApiError } from '../../api/errors'
import type { AuditEvent, AuditEventPage } from '../../api/audit'

const { listMock } = vi.hoisted(() => ({ listMock: vi.fn() }))

vi.mock('../../api/audit', () => ({ listAuditEvents: listMock }))

vi.mock('../../api/organisations', () => ({
  listOrganisations: vi.fn(async () => []),
  createOrganisation: vi.fn(),
  archiveOrganisation: vi.fn(),
}))

const ORG_A = 'org-a'
const ORG_B = 'org-b'

function event(id: string, action = 'organisation.created'): AuditEvent {
  return {
    id,
    actorUserId: 'user-1',
    action,
    entityType: 'organisation',
    entityId: ORG_A,
    metadata: {},
    createdAt: '2026-08-01T00:00:00.000Z',
  }
}

function page(events: AuditEvent[], nextCursor: string | null = null): AuditEventPage {
  return { events, nextCursor }
}

const pristineAudit = useAuditStore.getState()
const pristineOrganisations = useOrganisationStore.getState()
const pristineSession = useSessionStore.getState()

beforeEach(() => {
  useAuditStore.setState(pristineAudit, true)
  useOrganisationStore.setState(pristineOrganisations, true)
  useSessionStore.setState(pristineSession, true)
  listMock.mockReset()
})

describe('load', () => {
  it('requests the first page with the configured size', async () => {
    listMock.mockResolvedValue(page([event('a')], 'cursor-2'))
    await useAuditStore.getState().load(ORG_A)

    expect(listMock).toHaveBeenCalledWith(ORG_A, { limit: AUDIT_PAGE_SIZE })
    const state = useAuditStore.getState()
    expect(state.status).toBe('ready')
    expect(state.events).toHaveLength(1)
    expect(state.nextCursor).toBe('cursor-2')
  })

  it('records a failure and stays retryable', async () => {
    listMock.mockRejectedValueOnce(
      new ApiError({ message: 'Your role cannot perform this action', status: 403, code: 'ORGANISATION_ROLE_FORBIDDEN' }),
    )
    await useAuditStore.getState().load(ORG_A)
    expect(useAuditStore.getState().status).toBe('error')

    listMock.mockResolvedValueOnce(page([]))
    await useAuditStore.getState().load(ORG_A)
    expect(useAuditStore.getState().status).toBe('ready')
  })

  it('drops the filter when moving to a different organisation', async () => {
    listMock.mockResolvedValue(page([event('a')]))
    await useAuditStore.getState().load(ORG_A)
    await useAuditStore.getState().setAction('membership.removed')
    listMock.mockClear()

    await useAuditStore.getState().load(ORG_B)
    expect(listMock).toHaveBeenCalledWith(ORG_B, { limit: AUDIT_PAGE_SIZE })
    expect(useAuditStore.getState().action).toBeNull()
  })

  it('ignores a slow response for an organisation that is no longer selected', async () => {
    let release: (value: AuditEventPage) => void = () => {}
    listMock.mockReturnValueOnce(
      new Promise<AuditEventPage>((resolve) => {
        release = resolve
      }),
    )
    const slow = useAuditStore.getState().load(ORG_A)

    listMock.mockResolvedValueOnce(page([event('b')]))
    await useAuditStore.getState().load(ORG_B)

    release(page([event('a')]))
    await slow

    expect(useAuditStore.getState().organisationId).toBe(ORG_B)
    expect(useAuditStore.getState().events[0]?.id).toBe('b')
  })
})

describe('loadMore', () => {
  it('follows the cursor and appends rather than replacing', async () => {
    listMock.mockResolvedValueOnce(page([event('a')], 'cursor-2'))
    await useAuditStore.getState().load(ORG_A)

    listMock.mockResolvedValueOnce(page([event('b')], 'cursor-3'))
    await useAuditStore.getState().loadMore()

    expect(listMock).toHaveBeenLastCalledWith(ORG_A, {
      limit: AUDIT_PAGE_SIZE,
      cursor: 'cursor-2',
    })
    const state = useAuditStore.getState()
    expect(state.events.map((entry) => entry.id)).toEqual(['a', 'b'])
    expect(state.nextCursor).toBe('cursor-3')
  })

  it('carries the action filter onto later pages', async () => {
    listMock.mockResolvedValue(page([event('a', 'membership.removed')], 'cursor-2'))
    await useAuditStore.getState().load(ORG_A)
    await useAuditStore.getState().setAction('membership.removed')
    listMock.mockClear()

    listMock.mockResolvedValueOnce(page([], null))
    await useAuditStore.getState().loadMore()

    expect(listMock).toHaveBeenCalledWith(ORG_A, {
      limit: AUDIT_PAGE_SIZE,
      cursor: 'cursor-2',
      action: 'membership.removed',
    })
  })

  it('does nothing on the last page', async () => {
    listMock.mockResolvedValue(page([event('a')], null))
    await useAuditStore.getState().load(ORG_A)
    listMock.mockClear()

    await useAuditStore.getState().loadMore()
    expect(listMock).not.toHaveBeenCalled()
  })

  it('records a failure without losing the pages already fetched', async () => {
    listMock.mockResolvedValueOnce(page([event('a')], 'cursor-2'))
    await useAuditStore.getState().load(ORG_A)

    listMock.mockRejectedValueOnce(
      new ApiError({ message: 'Invalid audit cursor', status: 400, code: 'INVALID_AUDIT_CURSOR' }),
    )
    await useAuditStore.getState().loadMore()

    const state = useAuditStore.getState()
    expect(state.error).toBe('Invalid audit cursor')
    expect(state.events).toHaveLength(1)
    expect(state.loadingMore).toBe(false)
  })

  it('does not issue a second request while one is in flight', async () => {
    listMock.mockResolvedValueOnce(page([event('a')], 'cursor-2'))
    await useAuditStore.getState().load(ORG_A)

    let release: (value: AuditEventPage) => void = () => {}
    listMock.mockReturnValueOnce(
      new Promise<AuditEventPage>((resolve) => {
        release = resolve
      }),
    )
    const first = useAuditStore.getState().loadMore()
    const second = useAuditStore.getState().loadMore()

    release(page([event('b')], null))
    await Promise.all([first, second])

    expect(listMock).toHaveBeenCalledTimes(2)
    expect(useAuditStore.getState().events.map((entry) => entry.id)).toEqual(['a', 'b'])
  })
})

describe('setAction', () => {
  it('starts a fresh page instead of continuing the old cursor', async () => {
    listMock.mockResolvedValue(page([event('a')], 'cursor-2'))
    await useAuditStore.getState().load(ORG_A)
    listMock.mockClear()

    listMock.mockResolvedValue(page([event('b', 'membership.removed')], null))
    await useAuditStore.getState().setAction('membership.removed')

    expect(listMock).toHaveBeenCalledWith(ORG_A, {
      limit: AUDIT_PAGE_SIZE,
      action: 'membership.removed',
    })
    const state = useAuditStore.getState()
    expect(state.events.map((entry) => entry.id)).toEqual(['b'])
    expect(state.nextCursor).toBeNull()
  })

  it('does not let an older filter response overwrite the new filter', async () => {
    let release: (value: AuditEventPage) => void = () => {}
    listMock.mockReturnValueOnce(new Promise<AuditEventPage>((resolve) => { release = resolve }))
    const unfiltered = useAuditStore.getState().load(ORG_A)

    listMock.mockResolvedValueOnce(page([event('filtered', 'membership.removed')]))
    await useAuditStore.getState().setAction('membership.removed')
    release(page([event('unfiltered')]))
    await unfiltered

    const state = useAuditStore.getState()
    expect(state.action).toBe('membership.removed')
    expect(state.events.map((entry) => entry.id)).toEqual(['filtered'])
  })

  it('clears the filter back to the whole stream', async () => {
    listMock.mockResolvedValue(page([event('a')]))
    await useAuditStore.getState().load(ORG_A)
    await useAuditStore.getState().setAction('membership.removed')
    listMock.mockClear()

    listMock.mockResolvedValue(page([event('a')]))
    await useAuditStore.getState().setAction(null)

    expect(listMock).toHaveBeenCalledWith(ORG_A, { limit: AUDIT_PAGE_SIZE })
    expect(useAuditStore.getState().action).toBeNull()
  })

  it('does nothing when the filter is unchanged', async () => {
    listMock.mockResolvedValue(page([event('a')]))
    await useAuditStore.getState().load(ORG_A)
    listMock.mockClear()

    await useAuditStore.getState().setAction(null)
    expect(listMock).not.toHaveBeenCalled()
  })
})

describe('scope changes', () => {
  it('clears the stream when the selected organisation changes', async () => {
    listMock.mockResolvedValue(page([event('a')], 'cursor-2'))
    await useAuditStore.getState().load(ORG_A)

    useOrganisationStore.setState({ selectedId: ORG_B })

    const state = useAuditStore.getState()
    expect(state.events).toEqual([])
    expect(state.nextCursor).toBeNull()
    expect(state.organisationId).toBeNull()
  })

  it('clears the stream when an authenticated session ends', async () => {
    useSessionStore.setState({ status: 'authenticated' })
    listMock.mockResolvedValue(page([event('a')]))
    await useAuditStore.getState().load(ORG_A)

    useSessionStore.getState().expire()
    expect(useAuditStore.getState().events).toEqual([])
  })
})
