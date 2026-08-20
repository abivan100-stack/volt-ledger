// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSimulationPolling } from '../useSimulationPolling'
import { useSimulationStore } from '../../store/useSimulationStore'
import type { SimulationRun } from '../../api/simulations'

const { getRunMock, listMock, quotaMock } = vi.hoisted(() => ({
  getRunMock: vi.fn(),
  listMock: vi.fn(),
  quotaMock: vi.fn(),
}))

vi.mock('../../api/simulations', () => ({
  createSimulationRun: vi.fn(),
  listSimulationRuns: listMock,
  getSimulationRun: getRunMock,
  getSimulationResults: vi.fn(),
  getSimulationQuota: quotaMock,
}))

vi.mock('../../api/organisations', () => ({
  listOrganisations: vi.fn(async () => []),
  createOrganisation: vi.fn(),
  archiveOrganisation: vi.fn(),
}))

function run(id: string, status: SimulationRun['status']): SimulationRun {
  return {
    id,
    organisationId: 'org-a',
    requestedByUserId: 'user-1',
    seed: 'seed',
    modelVersion: 'monte-carlo-1',
    status,
    inputDigest: 'digest',
    resultDigest: null,
    errorCode: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    startedAt: null,
    completedAt: null,
  }
}

const pristine = useSimulationStore.getState()

beforeEach(() => {
  vi.useFakeTimers()
  useSimulationStore.setState(pristine, true)
  getRunMock.mockReset()
  listMock.mockReset()
  quotaMock.mockReset()
})

afterEach(() => {
  // Auto-cleanup is not enabled in this repo, so an un-unmounted hook would keep
  // its polling interval alive into the next test.
  cleanup()
  vi.useRealTimers()
})

function seedRuns(runs: SimulationRun[]): void {
  useSimulationStore.setState({ organisationId: 'org-a', status: 'ready', runs })
}

describe('useSimulationPolling', () => {
  it('issues no traffic when nothing is running', () => {
    seedRuns([run('run-1', 'completed')])
    renderHook(() => useSimulationPolling(1_000))

    act(() => {
      vi.advanceTimersByTime(5_000)
    })
    expect(getRunMock).not.toHaveBeenCalled()
  })

  it('polls while a run is still queued', () => {
    seedRuns([run('run-1', 'queued')])
    getRunMock.mockResolvedValue(run('run-1', 'queued'))
    renderHook(() => useSimulationPolling(1_000))

    act(() => {
      vi.advanceTimersByTime(3_000)
    })
    expect(getRunMock).toHaveBeenCalledTimes(3)
  })

  it('stops once every run has settled', async () => {
    seedRuns([run('run-1', 'queued')])
    getRunMock.mockResolvedValue(run('run-1', 'completed'))
    renderHook(() => useSimulationPolling(1_000))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000)
    })
    expect(getRunMock).toHaveBeenCalledTimes(1)
    expect(useSimulationStore.getState().runs[0]?.status).toBe('completed')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000)
    })
    // No further polls after the run settled.
    expect(getRunMock).toHaveBeenCalledTimes(1)
  })

  it('starts polling when a run becomes active', () => {
    seedRuns([run('run-1', 'completed')])
    getRunMock.mockResolvedValue(run('run-2', 'running'))
    renderHook(() => useSimulationPolling(1_000))

    act(() => {
      useSimulationStore.setState({ runs: [run('run-2', 'queued'), run('run-1', 'completed')] })
    })
    act(() => {
      vi.advanceTimersByTime(1_000)
    })

    expect(getRunMock).toHaveBeenCalledTimes(1)
  })

  it('stops polling when unmounted', () => {
    seedRuns([run('run-1', 'queued')])
    getRunMock.mockResolvedValue(run('run-1', 'queued'))
    const { unmount } = renderHook(() => useSimulationPolling(1_000))

    unmount()
    act(() => {
      vi.advanceTimersByTime(5_000)
    })
    expect(getRunMock).not.toHaveBeenCalled()
  })
})
