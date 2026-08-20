import { describe, it, expect, vi } from 'vitest'
import {
  SIMULATION_DAY_TYPES,
  createSimulationRun,
  getSimulationQuota,
  getSimulationQueue,
  getSimulationResults,
  getSimulationRun,
  listSimulationRuns,
  type CreateSimulationInput,
  type SimulationRun,
} from '../simulations'
import type { ApiClient } from '../client'

const ORGANISATION_ID = '11111111-1111-4111-8111-111111111111'
const RUN_ID = 'run-1'

const RUN: SimulationRun = {
  id: RUN_ID,
  organisationId: ORGANISATION_ID,
  requestedByUserId: 'user-1',
  seed: 'seed-1',
  modelVersion: 'monte-carlo-1',
  status: 'queued',
  inputDigest: 'digest-1',
  resultDigest: null,
  errorCode: null,
  createdAt: '2026-08-01T00:00:00.000Z',
  startedAt: null,
  completedAt: null,
}

const INPUT: CreateSimulationInput = {
  seed: 'seed-1',
  simulationDate: '2026-08-01',
  dayType: 'sunny-weekday',
  households: [{ id: 'h1', pvKw: 3, baseLoadKw: 1 }],
}

function stubClient(result: unknown) {
  const request = vi.fn(async () => result)
  return { client: { request } as unknown as ApiClient, request }
}

describe('SIMULATION_DAY_TYPES', () => {
  it('matches the day types the API accepts', () => {
    expect(SIMULATION_DAY_TYPES).toEqual(['sunny-weekday', 'cloudy', 'weekend', 'heatwave'])
  })
})

describe('createSimulationRun', () => {
  it('posts the input and returns the queued run', async () => {
    const { client, request } = stubClient({ run: RUN })
    const run = await createSimulationRun(ORGANISATION_ID, INPUT, { client })

    expect(request).toHaveBeenCalledWith(
      `/api/v1/organisations/${ORGANISATION_ID}/simulations`,
      { method: 'POST', body: INPUT, signal: undefined },
    )
    expect(run.status).toBe('queued')
  })
})

describe('listSimulationRuns', () => {
  it('lists runs without a limit by default', async () => {
    const { client, request } = stubClient({ runs: [RUN] })
    const runs = await listSimulationRuns(ORGANISATION_ID, { client })

    expect(request).toHaveBeenCalledWith(
      `/api/v1/organisations/${ORGANISATION_ID}/simulations`,
      { signal: undefined },
    )
    expect(runs).toEqual([RUN])
  })

  it('passes a limit as a query parameter, not a body', async () => {
    const { client, request } = stubClient({ runs: [] })
    await listSimulationRuns(ORGANISATION_ID, { client, limit: 10 })

    expect(request).toHaveBeenCalledWith(
      `/api/v1/organisations/${ORGANISATION_ID}/simulations`,
      { query: { limit: 10 }, signal: undefined },
    )
  })
})

describe('getSimulationRun', () => {
  it('reads one run by id', async () => {
    const { client, request } = stubClient({ run: RUN })
    const run = await getSimulationRun(ORGANISATION_ID, RUN_ID, { client })

    expect(request).toHaveBeenCalledWith(
      `/api/v1/organisations/${ORGANISATION_ID}/simulations/${RUN_ID}`,
      { signal: undefined },
    )
    expect(run).toEqual(RUN)
  })
})

describe('getSimulationResults', () => {
  it('returns the run alongside its intervals and summaries', async () => {
    const results = { run: { ...RUN, status: 'completed' }, intervals: [], summaries: [] }
    const { client, request } = stubClient(results)

    const received = await getSimulationResults(ORGANISATION_ID, RUN_ID, { client })

    expect(request).toHaveBeenCalledWith(
      `/api/v1/organisations/${ORGANISATION_ID}/simulations/${RUN_ID}/results`,
      { signal: undefined },
    )
    expect(received).toEqual(results)
  })

  it('passes a limit as a query parameter', async () => {
    const { client, request } = stubClient({ run: RUN, intervals: [], summaries: [] })
    await getSimulationResults(ORGANISATION_ID, RUN_ID, { client, limit: 100 })

    expect(request).toHaveBeenCalledWith(
      `/api/v1/organisations/${ORGANISATION_ID}/simulations/${RUN_ID}/results`,
      { query: { limit: 100 }, signal: undefined },
    )
  })
})

describe('getSimulationQuota', () => {
  it('unwraps the quota envelope', async () => {
    const quota = {
      usageDate: '2026-08-01',
      used: 3,
      limit: 100,
      remaining: 97,
      resetsAt: '2026-08-02T00:00:00.000Z',
    }
    const { client, request } = stubClient({ quota })

    expect(await getSimulationQuota(ORGANISATION_ID, { client })).toEqual(quota)
    expect(request).toHaveBeenCalledWith(
      `/api/v1/organisations/${ORGANISATION_ID}/simulations/quota`,
      { signal: undefined },
    )
  })
})

describe('getSimulationQueue', () => {
  it('returns the depth and the worker reading together', async () => {
    const payload = {
      queue: {
        queued: 4,
        running: 1,
        oldestQueuedAt: '2026-08-01T00:00:00.000Z',
        oldestQueuedWaitSeconds: 90,
      },
      worker: { liveness: 'live' as const, lastSeenAt: '2026-08-01T00:01:00.000Z' },
    }
    const { client, request } = stubClient(payload)

    // Returned whole rather than unwrapped: a depth without its worker reading
    // cannot be told apart from an outage.
    expect(await getSimulationQueue(ORGANISATION_ID, { client })).toEqual(payload)
    expect(request).toHaveBeenCalledWith(
      `/api/v1/organisations/${ORGANISATION_ID}/simulations/queue`,
      { signal: undefined },
    )
  })
})
