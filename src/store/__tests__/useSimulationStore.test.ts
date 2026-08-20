import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isActiveRun, useSimulationStore } from '../useSimulationStore'
import { useOrganisationStore } from '../useOrganisationStore'
import { useSessionStore } from '../useSessionStore'
import { ApiError } from '../../api/errors'
import type { SimulationQuota, SimulationRun } from '../../api/simulations'

const { createMock, listMock, getRunMock, resultsMock, quotaMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  listMock: vi.fn(),
  getRunMock: vi.fn(),
  resultsMock: vi.fn(),
  quotaMock: vi.fn(),
}))

vi.mock('../../api/simulations', () => ({
  createSimulationRun: createMock,
  listSimulationRuns: listMock,
  getSimulationRun: getRunMock,
  getSimulationResults: resultsMock,
  getSimulationQuota: quotaMock,
}))

vi.mock('../../api/organisations', () => ({
  listOrganisations: vi.fn(async () => []),
  createOrganisation: vi.fn(),
  archiveOrganisation: vi.fn(),
}))

const ORG_A = 'org-a'
const ORG_B = 'org-b'

function run(id: string, status: SimulationRun['status'] = 'queued'): SimulationRun {
  return {
    id,
    organisationId: ORG_A,
    requestedByUserId: 'user-1',
    seed: `seed-${id}`,
    modelVersion: 'monte-carlo-1',
    status,
    inputDigest: 'digest',
    resultDigest: status === 'completed' ? 'result-digest' : null,
    errorCode: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    startedAt: null,
    completedAt: null,
  }
}

const QUOTA: SimulationQuota = {
  usageDate: '2026-08-01',
  used: 3,
  limit: 100,
  remaining: 97,
  resetsAt: '2026-08-02T00:00:00.000Z',
}

const INPUT = {
  seed: 'seed-new',
  simulationDate: '2026-08-01',
  dayType: 'sunny-weekday' as const,
  households: [{ id: 'h1', pvKw: 3, baseLoadKw: 1 }],
}

const pristineSimulations = useSimulationStore.getState()
const pristineOrganisations = useOrganisationStore.getState()
const pristineSession = useSessionStore.getState()

beforeEach(() => {
  useSimulationStore.setState(pristineSimulations, true)
  useOrganisationStore.setState(pristineOrganisations, true)
  useSessionStore.setState(pristineSession, true)
  createMock.mockReset()
  listMock.mockReset()
  getRunMock.mockReset()
  resultsMock.mockReset()
  quotaMock.mockReset()
  quotaMock.mockResolvedValue(QUOTA)
})

describe('isActiveRun', () => {
  it('treats queued and running as still moving', () => {
    expect(isActiveRun(run('a', 'queued'))).toBe(true)
    expect(isActiveRun(run('a', 'running'))).toBe(true)
  })

  it('treats terminal statuses as settled', () => {
    expect(isActiveRun(run('a', 'completed'))).toBe(false)
    expect(isActiveRun(run('a', 'failed'))).toBe(false)
    expect(isActiveRun(run('a', 'cancelled'))).toBe(false)
  })
})

describe('load', () => {
  it('loads runs and quota together', async () => {
    listMock.mockResolvedValue([run('run-1')])
    await useSimulationStore.getState().load(ORG_A)

    const state = useSimulationStore.getState()
    expect(state.status).toBe('ready')
    expect(state.runs).toHaveLength(1)
    expect(state.quota).toEqual(QUOTA)
    expect(state.organisationId).toBe(ORG_A)
  })

  it('records a failure and stays retryable', async () => {
    listMock.mockRejectedValueOnce(
      new ApiError({ message: 'Organisation access denied', status: 403, code: 'ORGANISATION_ACCESS_DENIED' }),
    )
    await useSimulationStore.getState().load(ORG_A)
    expect(useSimulationStore.getState().status).toBe('error')

    listMock.mockResolvedValueOnce([])
    await useSimulationStore.getState().load(ORG_A)
    expect(useSimulationStore.getState().status).toBe('ready')
  })

  it('ignores a slow response for an organisation that is no longer selected', async () => {
    let release: (value: SimulationRun[]) => void = () => {}
    listMock.mockReturnValueOnce(
      new Promise<SimulationRun[]>((resolve) => {
        release = resolve
      }),
    )
    const slow = useSimulationStore.getState().load(ORG_A)

    listMock.mockResolvedValueOnce([run('run-b')])
    await useSimulationStore.getState().load(ORG_B)

    release([run('run-a')])
    await slow

    expect(useSimulationStore.getState().organisationId).toBe(ORG_B)
    expect(useSimulationStore.getState().runs[0]?.id).toBe('run-b')
  })
})

describe('submit', () => {
  it('adds the queued run, selects it, and refreshes the quota', async () => {
    listMock.mockResolvedValue([])
    await useSimulationStore.getState().load(ORG_A)
    quotaMock.mockClear()

    const queued = run('run-new')
    createMock.mockResolvedValue(queued)
    quotaMock.mockResolvedValue({ ...QUOTA, used: 4, remaining: 96 })

    const created = await useSimulationStore.getState().submit(INPUT)

    expect(createMock).toHaveBeenCalledWith(ORG_A, INPUT)
    expect(created).toEqual(queued)
    const state = useSimulationStore.getState()
    expect(state.runs[0]).toEqual(queued)
    expect(state.selectedRunId).toBe('run-new')
    expect(state.quota?.remaining).toBe(96)
  })

  it('propagates an exhausted quota without adding a run', async () => {
    listMock.mockResolvedValue([])
    await useSimulationStore.getState().load(ORG_A)

    createMock.mockRejectedValue(
      new ApiError({
        message: 'Daily simulation quota exceeded',
        status: 429,
        code: 'SIMULATION_QUOTA_EXCEEDED',
        retryAfterSeconds: 3600,
      }),
    )

    await expect(useSimulationStore.getState().submit(INPUT)).rejects.toMatchObject({
      code: 'SIMULATION_QUOTA_EXCEEDED',
    })
    expect(useSimulationStore.getState().runs).toEqual([])
  })

  it('refuses to act when no organisation is selected', async () => {
    await expect(useSimulationStore.getState().submit(INPUT)).rejects.toThrow(
      /No organisation is selected/,
    )
    expect(createMock).not.toHaveBeenCalled()
  })
})

describe('refreshActiveRuns', () => {
  it('re-reads only the runs that are still moving', async () => {
    listMock.mockResolvedValue([run('run-1', 'queued'), run('run-2', 'completed')])
    await useSimulationStore.getState().load(ORG_A)

    getRunMock.mockResolvedValue(run('run-1', 'running'))
    await useSimulationStore.getState().refreshActiveRuns()

    expect(getRunMock).toHaveBeenCalledTimes(1)
    expect(getRunMock).toHaveBeenCalledWith(ORG_A, 'run-1')
    expect(useSimulationStore.getState().runs[0]?.status).toBe('running')
  })

  it('does nothing when every run has settled', async () => {
    listMock.mockResolvedValue([run('run-1', 'completed'), run('run-2', 'failed')])
    await useSimulationStore.getState().load(ORG_A)

    await useSimulationStore.getState().refreshActiveRuns()
    expect(getRunMock).not.toHaveBeenCalled()
  })

  it('keeps the existing run when a refresh fails', async () => {
    listMock.mockResolvedValue([run('run-1', 'queued')])
    await useSimulationStore.getState().load(ORG_A)

    getRunMock.mockRejectedValue(
      new ApiError({ message: 'Could not reach the Volt API', status: 0, code: 'NETWORK_ERROR' }),
    )
    await expect(useSimulationStore.getState().refreshActiveRuns()).resolves.toBeUndefined()
    expect(useSimulationStore.getState().runs[0]?.status).toBe('queued')
  })
})

describe('loadResults', () => {
  it('stores the results of a completed run', async () => {
    listMock.mockResolvedValue([run('run-1', 'completed')])
    await useSimulationStore.getState().load(ORG_A)

    const results = { run: run('run-1', 'completed'), intervals: [], summaries: [] }
    resultsMock.mockResolvedValue(results)

    await useSimulationStore.getState().loadResults('run-1')

    const state = useSimulationStore.getState()
    expect(state.resultsStatus).toBe('ready')
    expect(state.results).toEqual(results)
    expect(state.selectedRunId).toBe('run-1')
  })

  it('treats a run that has not finished as pending, not an error', async () => {
    listMock.mockResolvedValue([run('run-1', 'queued')])
    await useSimulationStore.getState().load(ORG_A)

    resultsMock.mockRejectedValue(
      new ApiError({
        message: 'Simulation results are not available yet',
        status: 409,
        code: 'SIMULATION_NOT_COMPLETE',
      }),
    )

    await useSimulationStore.getState().loadResults('run-1')

    const state = useSimulationStore.getState()
    expect(state.resultsStatus).toBe('pending')
    expect(state.resultsError).toBeNull()
  })

  it('records any other failure', async () => {
    listMock.mockResolvedValue([run('run-1', 'completed')])
    await useSimulationStore.getState().load(ORG_A)

    resultsMock.mockRejectedValue(
      new ApiError({ message: 'Simulation run not found', status: 404, code: 'SIMULATION_NOT_FOUND' }),
    )

    await useSimulationStore.getState().loadResults('run-1')
    expect(useSimulationStore.getState().resultsStatus).toBe('error')
    expect(useSimulationStore.getState().resultsError).toBe('Simulation run not found')
  })

  it('discards a response for a run the user has moved off', async () => {
    listMock.mockResolvedValue([run('run-1', 'completed'), run('run-2', 'completed')])
    await useSimulationStore.getState().load(ORG_A)

    let release: (value: unknown) => void = () => {}
    resultsMock.mockReturnValueOnce(
      new Promise((resolve) => {
        release = resolve
      }),
    )
    const slow = useSimulationStore.getState().loadResults('run-1')

    useSimulationStore.getState().selectRun('run-2')
    release({ run: run('run-1', 'completed'), intervals: [], summaries: [] })
    await slow

    expect(useSimulationStore.getState().results).toBeNull()
    expect(useSimulationStore.getState().selectedRunId).toBe('run-2')
  })
})

describe('selectRun', () => {
  it('clears results held for the previous run', async () => {
    listMock.mockResolvedValue([run('run-1', 'completed')])
    await useSimulationStore.getState().load(ORG_A)
    resultsMock.mockResolvedValue({ run: run('run-1', 'completed'), intervals: [], summaries: [] })
    await useSimulationStore.getState().loadResults('run-1')

    useSimulationStore.getState().selectRun('run-2')

    const state = useSimulationStore.getState()
    expect(state.results).toBeNull()
    expect(state.resultsStatus).toBe('idle')
  })

  it('does nothing when the run is already selected', async () => {
    listMock.mockResolvedValue([run('run-1', 'completed')])
    await useSimulationStore.getState().load(ORG_A)
    resultsMock.mockResolvedValue({ run: run('run-1', 'completed'), intervals: [], summaries: [] })
    await useSimulationStore.getState().loadResults('run-1')

    useSimulationStore.getState().selectRun('run-1')
    expect(useSimulationStore.getState().resultsStatus).toBe('ready')
  })
})

describe('scope changes', () => {
  it('clears everything when the selected organisation changes', async () => {
    listMock.mockResolvedValue([run('run-1')])
    await useSimulationStore.getState().load(ORG_A)

    useOrganisationStore.setState({ selectedId: ORG_B })

    const state = useSimulationStore.getState()
    expect(state.runs).toEqual([])
    expect(state.quota).toBeNull()
    expect(state.organisationId).toBeNull()
  })

  it('clears everything when an authenticated session ends', async () => {
    useSessionStore.setState({ status: 'authenticated' })
    listMock.mockResolvedValue([run('run-1')])
    await useSimulationStore.getState().load(ORG_A)

    useSessionStore.getState().expire()
    expect(useSimulationStore.getState().runs).toEqual([])
  })
})
