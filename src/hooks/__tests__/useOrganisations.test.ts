// @vitest-environment happy-dom
import { renderHook, waitFor } from '@testing-library/react'
import { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useOrganisations } from '../useOrganisations'
import { useOrganisationStore } from '../../store/useOrganisationStore'
import { useSessionStore } from '../../store/useSessionStore'
import type { Organisation } from '../../api/organisations'

const { listMock } = vi.hoisted(() => ({ listMock: vi.fn() }))

vi.mock('../../api/organisations', () => ({
  listOrganisations: listMock,
  createOrganisation: vi.fn(),
  archiveOrganisation: vi.fn(),
}))

const ORGANISATION: Organisation = {
  id: 'org-a',
  name: 'Nolambur Microgrid',
  slug: 'nolambur-microgrid',
  role: 'owner',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
}

const pristineOrganisations = useOrganisationStore.getState()
const pristineSession = useSessionStore.getState()

beforeEach(() => {
  useOrganisationStore.setState(pristineOrganisations, true)
  useSessionStore.setState(pristineSession, true)
  listMock.mockReset()
  listMock.mockResolvedValue([ORGANISATION])
})

describe('useOrganisations', () => {
  it('does not load anything for a signed-out visitor', async () => {
    useSessionStore.setState({ status: 'anonymous' })
    renderHook(() => useOrganisations())

    await waitFor(() => expect(listMock).not.toHaveBeenCalled())
    expect(useOrganisationStore.getState().status).toBe('unknown')
  })

  it('loads once the visitor is signed in', async () => {
    useSessionStore.setState({ status: 'authenticated' })
    renderHook(() => useOrganisations())

    await waitFor(() => expect(useOrganisationStore.getState().status).toBe('ready'))
    expect(listMock).toHaveBeenCalledTimes(1)
  })

  it('loads when the session becomes authenticated after mount', async () => {
    useSessionStore.setState({ status: 'restoring' })
    renderHook(() => useOrganisations())
    expect(listMock).not.toHaveBeenCalled()

    await act(async () => {
      useSessionStore.setState({ status: 'authenticated' })
    })

    await waitFor(() => expect(listMock).toHaveBeenCalledTimes(1))
  })

  it('does not reload on re-render', async () => {
    useSessionStore.setState({ status: 'authenticated' })
    const { rerender } = renderHook(() => useOrganisations())
    await waitFor(() => expect(useOrganisationStore.getState().status).toBe('ready'))

    rerender()
    rerender()
    expect(listMock).toHaveBeenCalledTimes(1)
  })

  it('returns the current organisation state', async () => {
    useSessionStore.setState({ status: 'authenticated' })
    const { result } = renderHook(() => useOrganisations())

    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.organisations).toEqual([ORGANISATION])
    expect(result.current.selectedId).toBe('org-a')
  })
})
