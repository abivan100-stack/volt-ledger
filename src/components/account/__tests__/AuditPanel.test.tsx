// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import AuditPanel from '../AuditPanel'
import { AUDIT_PAGE_SIZE, useAuditStore } from '../../../store/useAuditStore'
import { useOrganisationStore } from '../../../store/useOrganisationStore'
import { ApiError } from '../../../api/errors'
import type { AuditEvent, AuditEventPage } from '../../../api/audit'
import type { MembershipRole } from '../../../lib/permissions'

const { listMock } = vi.hoisted(() => ({ listMock: vi.fn() }))

vi.mock('../../../api/audit', () => ({ listAuditEvents: listMock }))

vi.mock('../../../api/organisations', () => ({
  listOrganisations: vi.fn(async () => []),
  createOrganisation: vi.fn(),
  archiveOrganisation: vi.fn(),
}))

const ORG_ID = 'org-a'

function event(id: string, action = 'organisation.created'): AuditEvent {
  return {
    id,
    actorUserId: 'user-1',
    action,
    entityType: 'organisation',
    entityId: ORG_ID,
    metadata: {},
    createdAt: '2026-08-01T00:00:00.000Z',
  }
}

function page(events: AuditEvent[], nextCursor: string | null = null): AuditEventPage {
  return { events, nextCursor }
}

const pristineAudit = useAuditStore.getState()
const pristineOrganisations = useOrganisationStore.getState()

function selectAs(role: MembershipRole): void {
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
  useAuditStore.setState(pristineAudit, true)
  useOrganisationStore.setState(pristineOrganisations, true)
  listMock.mockReset()
  listMock.mockResolvedValue(page([event('a')], 'cursor-2'))
})

afterEach(() => {
  cleanup()
})

async function renderAs(role: MembershipRole): Promise<void> {
  selectAs(role)
  render(<AuditPanel />)
  await waitFor(() => expect(useAuditStore.getState().status).toBe('ready'))
}

describe('AuditPanel visibility', () => {
  it('renders nothing without a selected organisation', () => {
    const { container } = render(<AuditPanel />)
    expect(container.textContent).toBe('')
    expect(listMock).not.toHaveBeenCalled()
  })

  it('renders nothing for an operator, who cannot read the route', () => {
    selectAs('operator')
    const { container } = render(<AuditPanel />)
    expect(container.textContent).toBe('')
    expect(listMock).not.toHaveBeenCalled()
  })

  it('renders nothing for a viewer', () => {
    selectAs('viewer')
    const { container } = render(<AuditPanel />)
    expect(container.textContent).toBe('')
  })

  it('loads the stream for an admin', async () => {
    await renderAs('admin')
    expect(listMock).toHaveBeenCalledWith(ORG_ID, { limit: AUDIT_PAGE_SIZE })
    expect(screen.getByText('organisation.created')).toBeTruthy()
  })

  it('says the history is retained after archival', async () => {
    await renderAs('owner')
    expect(screen.getByText(/retained for provenance/i)).toBeTruthy()
  })
})

describe('AuditPanel pagination', () => {
  it('offers to load older events while a cursor remains', async () => {
    await renderAs('owner')
    expect(screen.getByRole('button', { name: /load older/i })).toBeTruthy()
  })

  it('appends the next page rather than replacing the list', async () => {
    await renderAs('owner')
    listMock.mockResolvedValueOnce(page([event('b', 'membership.removed')], null))

    fireEvent.click(screen.getByRole('button', { name: /load older/i }))

    await waitFor(() => expect(screen.getByText('membership.removed')).toBeTruthy())
    expect(screen.getByText('organisation.created')).toBeTruthy()
    expect(listMock).toHaveBeenLastCalledWith(ORG_ID, {
      limit: AUDIT_PAGE_SIZE,
      cursor: 'cursor-2',
    })
  })

  it('hides the control on the last page', async () => {
    listMock.mockResolvedValue(page([event('a')], null))
    await renderAs('owner')
    expect(screen.queryByRole('button', { name: /load older/i })).toBeNull()
  })

  it('keeps the loaded events when a further page fails', async () => {
    await renderAs('owner')
    listMock.mockRejectedValueOnce(
      new ApiError({ message: 'Invalid audit cursor', status: 400, code: 'INVALID_AUDIT_CURSOR' }),
    )

    fireEvent.click(screen.getByRole('button', { name: /load older/i }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/Invalid audit cursor/i)
    expect(screen.getByText('organisation.created')).toBeTruthy()
  })
})

describe('AuditPanel filtering', () => {
  it('filters by an exact action and restarts paging', async () => {
    await renderAs('owner')
    listMock.mockClear()
    listMock.mockResolvedValue(page([event('b', 'membership.removed')], null))

    fireEvent.change(screen.getByLabelText(/filter by action/i), {
      target: { value: 'membership.removed' },
    })
    fireEvent.click(screen.getByRole('button', { name: /apply/i }))

    await waitFor(() =>
      expect(listMock).toHaveBeenCalledWith(ORG_ID, {
        limit: AUDIT_PAGE_SIZE,
        action: 'membership.removed',
      }),
    )
    expect(screen.getByText(/SHOWING ONLY membership.removed/)).toBeTruthy()
  })

  it('trims whitespace around the action', async () => {
    await renderAs('owner')
    listMock.mockClear()
    listMock.mockResolvedValue(page([], null))

    fireEvent.change(screen.getByLabelText(/filter by action/i), {
      target: { value: '  membership.removed  ' },
    })
    fireEvent.click(screen.getByRole('button', { name: /apply/i }))

    await waitFor(() =>
      expect(listMock).toHaveBeenCalledWith(ORG_ID, {
        limit: AUDIT_PAGE_SIZE,
        action: 'membership.removed',
      }),
    )
  })

  it('clears the filter back to the whole stream', async () => {
    await renderAs('owner')
    listMock.mockResolvedValue(page([event('b', 'membership.removed')], null))
    fireEvent.change(screen.getByLabelText(/filter by action/i), {
      target: { value: 'membership.removed' },
    })
    fireEvent.click(screen.getByRole('button', { name: /apply/i }))
    await waitFor(() => expect(useAuditStore.getState().action).toBe('membership.removed'))

    listMock.mockResolvedValue(page([event('a')], null))
    fireEvent.click(screen.getByRole('button', { name: /clear/i }))

    await waitFor(() => expect(useAuditStore.getState().action).toBeNull())
    expect(screen.queryByText(/SHOWING ONLY/)).toBeNull()
  })

  it('distinguishes an empty stream from an empty filter result', async () => {
    listMock.mockResolvedValue(page([], null))
    await renderAs('owner')
    expect(screen.getByText(/no audit events recorded yet/i)).toBeTruthy()

    fireEvent.change(screen.getByLabelText(/filter by action/i), {
      target: { value: 'membership.removed' },
    })
    fireEvent.click(screen.getByRole('button', { name: /apply/i }))

    await waitFor(() => expect(screen.getByText(/no audit events match that action/i)).toBeTruthy())
  })
})

describe('AuditPanel failures', () => {
  it('offers a retry when the first page fails', async () => {
    listMock.mockReset()
    listMock.mockRejectedValueOnce(
      new ApiError({ message: 'Your role cannot perform this action', status: 403, code: 'ORGANISATION_ROLE_FORBIDDEN' }),
    )
    selectAs('owner')
    render(<AuditPanel />)

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/cannot perform this action/i)

    listMock.mockResolvedValueOnce(page([event('a')], null))
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    await waitFor(() => expect(useAuditStore.getState().status).toBe('ready'))
  })
})
