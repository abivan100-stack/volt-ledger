// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import ArchiveOrganisation from '../ArchiveOrganisation'
import { useOrganisationStore } from '../../../store/useOrganisationStore'
import { ApiError } from '../../../api/errors'
import type { MembershipRole } from '../../../lib/permissions'

const { archiveMock } = vi.hoisted(() => ({ archiveMock: vi.fn() }))

vi.mock('../../../api/organisations', () => ({
  listOrganisations: vi.fn(async () => []),
  createOrganisation: vi.fn(),
  archiveOrganisation: archiveMock,
}))

const ORG_ID = 'org-a'
const SLUG = 'nolambur-microgrid'

const pristine = useOrganisationStore.getState()

function selectAs(role: MembershipRole): void {
  useOrganisationStore.setState({
    status: 'ready',
    organisations: [
      {
        id: ORG_ID,
        name: 'Nolambur Microgrid',
        slug: SLUG,
        role,
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z',
      },
    ],
    selectedId: ORG_ID,
  })
}

beforeEach(() => {
  useOrganisationStore.setState(pristine, true)
  archiveMock.mockReset()
})

afterEach(() => {
  cleanup()
})

function openForm(): void {
  fireEvent.click(screen.getByRole('button', { name: /archive organisation/i }))
}

function confirmationField(): HTMLInputElement {
  return screen.getByLabelText(/to confirm/i) as HTMLInputElement
}

describe('ArchiveOrganisation visibility', () => {
  it('renders nothing without a selected organisation', () => {
    const { container } = render(<ArchiveOrganisation />)
    expect(container.textContent).toBe('')
  })

  it('is offered to the owner only', () => {
    for (const role of ['admin', 'operator', 'viewer'] as const) {
      selectAs(role)
      const { container, unmount } = render(<ArchiveOrganisation />)
      expect(container.textContent).toBe('')
      unmount()
    }

    selectAs('owner')
    render(<ArchiveOrganisation />)
    expect(screen.getByRole('button', { name: /archive organisation/i })).toBeTruthy()
  })
})

describe('ArchiveOrganisation confirmation', () => {
  beforeEach(() => {
    selectAs('owner')
    render(<ArchiveOrganisation />)
  })

  it('keeps the form behind a disclosure', () => {
    expect(screen.queryByLabelText(/to confirm/i)).toBeNull()
    openForm()
    expect(confirmationField()).toBeTruthy()
  })

  it('explains what is removed, what is retained, and what can be undone', () => {
    openForm()
    const warning = screen.getByText(/removes every member/i)
    expect(warning.textContent).toMatch(/soft-deletes its simulation runs/i)
    expect(warning.textContent).toMatch(/Ledger and audit history are retained/i)
    // This said "cannot be undone" after restore shipped. Telling an owner a
    // recoverable action is permanent is its own kind of wrong, so the window
    // and its end are both named.
    expect(warning.textContent).toMatch(/restore it for a limited time/i)
    expect(warning.textContent).toMatch(/deleted permanently/i)
    expect(warning.textContent).not.toMatch(/cannot be undone/i)
  })

  it('warns that a restore does not reissue the invitations it revoked', () => {
    openForm()
    const warning = screen.getByText(/removes every member/i)
    expect(warning.textContent).toMatch(/not reissued by a restore/i)
  })

  it('refuses to archive until the identifier is typed exactly', () => {
    openForm()
    fireEvent.change(confirmationField(), { target: { value: 'nolambur' } })
    fireEvent.click(screen.getByRole('button', { name: /^archive organisation$/i }))

    expect(archiveMock).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toMatch(new RegExp(SLUG))
  })

  it('refuses to archive on an empty confirmation', () => {
    openForm()
    fireEvent.click(screen.getByRole('button', { name: /^archive organisation$/i }))
    expect(archiveMock).not.toHaveBeenCalled()
  })

  it('archives once the identifier matches', async () => {
    archiveMock.mockResolvedValue(undefined)
    openForm()
    fireEvent.change(confirmationField(), { target: { value: SLUG } })
    fireEvent.click(screen.getByRole('button', { name: /^archive organisation$/i }))

    await waitFor(() => expect(archiveMock).toHaveBeenCalledWith(ORG_ID))
    expect(useOrganisationStore.getState().organisations).toEqual([])
  })

  it('can be cancelled, clearing what was typed', () => {
    openForm()
    fireEvent.change(confirmationField(), { target: { value: SLUG } })
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))

    expect(screen.queryByLabelText(/to confirm/i)).toBeNull()
    openForm()
    expect(confirmationField().value).toBe('')
  })

  it('reports a refused archive and stays usable', async () => {
    archiveMock.mockRejectedValue(
      new ApiError({ message: 'Organisation changed before deletion', status: 409, code: 'ORGANISATION_CHANGED' }),
    )
    openForm()
    fireEvent.change(confirmationField(), { target: { value: SLUG } })
    fireEvent.click(screen.getByRole('button', { name: /^archive organisation$/i }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/Organisation changed before deletion/i)
    expect(useOrganisationStore.getState().organisations).toHaveLength(1)

    const submit = screen.getByRole('button', { name: /^archive organisation$/i }) as HTMLButtonElement
    expect(submit.disabled).toBe(false)
  })
})
