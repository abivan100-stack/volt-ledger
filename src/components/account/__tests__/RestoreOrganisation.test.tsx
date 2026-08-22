// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import RestoreOrganisation from '../RestoreOrganisation'
import { useOrganisationStore } from '../../../store/useOrganisationStore'
import { ApiError } from '../../../api/errors'
import type { ArchivedOrganisation } from '../../../api/organisations'

/**
 * The way back from an archive.
 *
 * An archived organisation has no active memberships, so nothing else in the UI
 * can show it. If this surface is wrong, a thirty-day recovery window is
 * effectively no window at all.
 */

const { listArchivedMock, restoreMock } = vi.hoisted(() => ({
  listArchivedMock: vi.fn(),
  restoreMock: vi.fn(),
}))

vi.mock('../../../api/organisations', () => ({
  listOrganisations: vi.fn(async () => []),
  createOrganisation: vi.fn(),
  archiveOrganisation: vi.fn(),
  listArchivedOrganisations: listArchivedMock,
  restoreOrganisation: restoreMock,
}))

const DAY = 24 * 60 * 60 * 1000
const HOUR = 60 * 60 * 1000

/**
 * Half a day past the whole number, so the floored countdown reads 28 however
 * long the test itself takes. An exact multiple would tick to 27 the moment any
 * time passed between building this and rendering it.
 */
function archived(overrides: Partial<ArchivedOrganisation> = {}): ArchivedOrganisation {
  return {
    id: 'org-a',
    name: 'Nolambur Microgrid',
    slug: 'nolambur-microgrid',
    archivedAt: new Date(Date.now() - 2 * DAY).toISOString(),
    restorableUntil: new Date(Date.now() + 28 * DAY + 12 * HOUR).toISOString(),
    ...overrides,
  }
}

const pristine = useOrganisationStore.getState()

beforeEach(() => {
  useOrganisationStore.setState(pristine, true)
  listArchivedMock.mockReset()
  listArchivedMock.mockResolvedValue([])
  restoreMock.mockReset()
})

afterEach(() => {
  cleanup()
})

async function show(entries: ArchivedOrganisation[]): Promise<void> {
  listArchivedMock.mockResolvedValue(entries)
  render(<RestoreOrganisation />)
  await waitFor(() => {
    expect(useOrganisationStore.getState().archivedStatus).toBe('ready')
  })
}

describe('RestoreOrganisation with nothing archived', () => {
  it('renders nothing at all', async () => {
    const { container } = render(<RestoreOrganisation />)
    await waitFor(() => {
      expect(useOrganisationStore.getState().archivedStatus).toBe('ready')
    })

    // A permanent empty heading would suggest a feature where there is only an
    // absence.
    expect(container.textContent).toBe('')
  })

  it('asks the server once on sight', async () => {
    render(<RestoreOrganisation />)
    await waitFor(() => {
      expect(listArchivedMock).toHaveBeenCalledTimes(1)
    })
  })
})

describe('RestoreOrganisation listing archives', () => {
  it('names the organisation and how long is left', async () => {
    await show([archived()])

    expect(screen.getByText('Nolambur Microgrid')).toBeTruthy()
    expect(screen.getByText(/28 days left/)).toBeTruthy()
  })

  it('states the deadline itself, not only the countdown', async () => {
    const deadline = new Date(Date.now() + 28 * DAY)
    await show([archived({ restorableUntil: deadline.toISOString() })])

    expect(screen.getByText(new RegExp(deadline.toUTCString()))).toBeTruthy()
  })

  it('says what a restore does not bring back', async () => {
    await show([archived()])

    // Revoked invitations are not reissued, and that is not guessable.
    expect(screen.getByText(/not reissued/i)).toBeTruthy()
  })

  it('lists every archive separately', async () => {
    await show([archived(), archived({ id: 'org-b', name: 'Ashok Nagar', slug: 'ashok-nagar' })])

    expect(screen.getAllByRole('button', { name: /^restore /i })).toHaveLength(2)
  })

  it('names the organisation in each button, so two are told apart', async () => {
    await show([archived(), archived({ id: 'org-b', name: 'Ashok Nagar', slug: 'ashok-nagar' })])

    expect(screen.getByRole('button', { name: 'Restore Nolambur Microgrid' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Restore Ashok Nagar' })).toBeTruthy()
  })
})

describe('RestoreOrganisation acting on an archive', () => {
  it('restores the organisation it names', async () => {
    await show([archived()])
    restoreMock.mockResolvedValue({
      id: 'org-a',
      name: 'Nolambur Microgrid',
      slug: 'nolambur-microgrid',
      role: 'owner',
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
    })

    fireEvent.click(screen.getByRole('button', { name: 'Restore Nolambur Microgrid' }))

    await waitFor(() => {
      expect(restoreMock).toHaveBeenCalledWith('org-a')
    })
    await waitFor(() => {
      expect(useOrganisationStore.getState().organisations).toHaveLength(1)
    })
  })

  it('reports a refusal next to the entry that caused it', async () => {
    await show([archived()])
    restoreMock.mockRejectedValue(
      new ApiError({
        message: 'No archived organisation to restore, or it is past its recovery window.',
        status: 404,
        code: 'ORGANISATION_NOT_RESTORABLE',
      }),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Restore Nolambur Microgrid' }))

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toMatch(/past its recovery window/i)
    })
    // Still listed, so the reason stays attached to something.
    expect(screen.getByText('Nolambur Microgrid')).toBeTruthy()
  })

  it('offers no button once the window has closed', async () => {
    await show([archived({ restorableUntil: new Date(Date.now() - DAY).toISOString() })])

    expect(screen.getByText(/Recovery window closed/)).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Restore Nolambur Microgrid' }).hasAttribute('disabled'),
    ).toBe(true)
  })

  it('does not fire twice on a double click', async () => {
    await show([archived()])
    restoreMock.mockImplementation(() => new Promise(() => undefined))

    const button = screen.getByRole('button', { name: 'Restore Nolambur Microgrid' })
    fireEvent.click(button)
    fireEvent.click(button)

    await waitFor(() => {
      expect(restoreMock).toHaveBeenCalledTimes(1)
    })
  })
})

describe('RestoreOrganisation when the archives cannot be read', () => {
  it('says so and offers a retry rather than looking empty', async () => {
    listArchivedMock.mockRejectedValue(
      new ApiError({ message: 'Service unavailable', status: 503, code: 'UNAVAILABLE' }),
    )
    render(<RestoreOrganisation />)

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toBe('Service unavailable')
    })

    // Rendering nothing here would be indistinguishable from having no archives,
    // which is the one thing a failed read cannot tell us.
    listArchivedMock.mockResolvedValue([archived()])
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))

    await waitFor(() => {
      expect(screen.getByText('Nolambur Microgrid')).toBeTruthy()
    })
  })
})
