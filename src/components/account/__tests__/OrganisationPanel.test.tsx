// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import OrganisationPanel from '../OrganisationPanel'
import { useOrganisationStore } from '../../../store/useOrganisationStore'
import { useSessionStore } from '../../../store/useSessionStore'
import { ApiError } from '../../../api/errors'
import type { Organisation } from '../../../api/organisations'

const { listMock, createMock, archiveMock, listArchivedMock, restoreMock } = vi.hoisted(() => ({
  listMock: vi.fn(),
  createMock: vi.fn(),
  archiveMock: vi.fn(),
  listArchivedMock: vi.fn(),
  restoreMock: vi.fn(),
}))

vi.mock('../../../api/organisations', () => ({
  listOrganisations: listMock,
  createOrganisation: createMock,
  archiveOrganisation: archiveMock,
  listArchivedOrganisations: listArchivedMock,
  restoreOrganisation: restoreMock,
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

const OWNED = organisation('a', { name: 'Nolambur Microgrid', slug: 'nolambur-microgrid' })
const VIEWED = organisation('b', { name: 'Ashok Nagar', slug: 'ashok-nagar', role: 'viewer' })

const pristineOrganisations = useOrganisationStore.getState()
const pristineSession = useSessionStore.getState()

beforeEach(() => {
  useOrganisationStore.setState(pristineOrganisations, true)
  useSessionStore.setState(pristineSession, true)
  useSessionStore.setState({ status: 'authenticated' })
  listMock.mockReset()
  createMock.mockReset()
  archiveMock.mockReset()
  restoreMock.mockReset()
  // The panel mounts the restore surface, which asks for the archives on sight.
  listArchivedMock.mockReset()
  listArchivedMock.mockResolvedValue([])
})

afterEach(() => {
  cleanup()
})

function selector(): HTMLSelectElement {
  return screen.getByLabelText(/organisation/i) as HTMLSelectElement
}

describe('OrganisationPanel for a signed-out visitor', () => {
  it('renders nothing', () => {
    useSessionStore.setState({ status: 'anonymous' })
    const { container } = render(<OrganisationPanel />)
    expect(container.textContent).toBe('')
    expect(listMock).not.toHaveBeenCalled()
  })
})

describe('OrganisationPanel while loading', () => {
  it('shows a loading state', async () => {
    listMock.mockReturnValue(new Promise(() => {}))
    render(<OrganisationPanel />)
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/loading/i))
  })
})

describe('OrganisationPanel when the list fails', () => {
  it('offers a retry that loads again', async () => {
    listMock.mockRejectedValueOnce(
      new ApiError({ message: 'Could not reach the Volt API', status: 0, code: 'NETWORK_ERROR' }),
    )
    render(<OrganisationPanel />)

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/Could not reach the Volt API/i)

    listMock.mockResolvedValueOnce([OWNED])
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))

    await waitFor(() => expect(useOrganisationStore.getState().status).toBe('ready'))
  })
})

describe('OrganisationPanel with no organisations', () => {
  beforeEach(() => {
    listMock.mockResolvedValue([])
  })

  it('invites the visitor to create their first organisation', async () => {
    render(<OrganisationPanel />)
    // Not findByRole('status'): the loading notice carries that role too and
    // would resolve first.
    expect(await screen.findByText(/first organisation/i)).toBeTruthy()
  })

  it('shows the creation form without needing a toggle', async () => {
    render(<OrganisationPanel />)
    await screen.findByText(/first organisation/i)
    expect(screen.getByLabelText(/^name/i)).toBeTruthy()
  })
})

describe('OrganisationPanel with organisations', () => {
  beforeEach(() => {
    listMock.mockResolvedValue([OWNED, VIEWED])
  })

  it('lists every organisation and preselects the first', async () => {
    render(<OrganisationPanel />)
    await waitFor(() => expect(useOrganisationStore.getState().status).toBe('ready'))

    expect(selector().value).toBe(OWNED.id)
    expect(screen.getByRole('option', { name: /Ashok Nagar/ })).toBeTruthy()
  })

  it('changes the selection', async () => {
    render(<OrganisationPanel />)
    await waitFor(() => expect(useOrganisationStore.getState().status).toBe('ready'))

    fireEvent.change(selector(), { target: { value: VIEWED.id } })

    expect(useOrganisationStore.getState().selectedId).toBe(VIEWED.id)
  })

  it('shows the role held in the selected organisation', async () => {
    render(<OrganisationPanel />)
    await waitFor(() => expect(useOrganisationStore.getState().status).toBe('ready'))
    expect(screen.getByText('Owner')).toBeTruthy()

    fireEvent.change(selector(), { target: { value: VIEWED.id } })
    expect(screen.getByText('Viewer')).toBeTruthy()
  })

  it('keeps the creation form behind a toggle once one exists', async () => {
    render(<OrganisationPanel />)
    await waitFor(() => expect(useOrganisationStore.getState().status).toBe('ready'))

    expect(screen.queryByLabelText(/^name/i)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /new organisation/i }))
    expect(screen.getByLabelText(/^name/i)).toBeTruthy()
  })
})
