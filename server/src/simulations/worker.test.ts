import { describe, expect, it } from 'vitest'
import type { SimulationRunDocument } from '../db/models.js'
import { digestSimulationInput } from './monteCarlo.js'
import {
  executeClaimedSimulationRun,
  expirePendingInvitations,
  processNextSimulationRun,
  runSimulationWorker,
} from './worker.js'

const inputSnapshot = {
  simulationDate: '2030-01-01',
  dayType: 'sunny-weekday' as const,
  households: [{ id: 'household_1', pvKw: 4.2, baseLoadKw: 0.6 }],
  sampleCount: 10,
  intervalMinutes: 60 as const,
  rateInrPerKwh: 5.5,
}

const run: SimulationRunDocument = {
  _id: 'run_123',
  organisationId: '9bf4cf78-0aeb-4ef8-9344-7d706de9e576',
  requestedByUserId: 'user_123',
  seed: 'worker-seed',
  modelVersion: 'monte-carlo-v1',
  inputSnapshot,
  inputDigest: digestSimulationInput(inputSnapshot),
  status: 'running',
  createdAt: new Date('2030-01-01T00:00:00.000Z'),
  startedAt: new Date('2030-01-01T00:01:00.000Z'),
  completedAt: null,
  resultDigest: null,
  errorCode: null,
  deletedAt: null,
}

function repositories() {
  let completionInput: unknown
  let failedRun: { id: string; errorCode: string } | undefined
  let invitationCleanupCount = 0
  return {
    simulations: {
      completeRun: async (input: unknown) => {
        completionInput = input
        return { ...run, status: 'completed' as const, resultDigest: 'result-digest' }
      },
      transitionRun: async (id: string, status: 'failed', details: { errorCode?: string }) => {
        failedRun = { id, errorCode: details.errorCode ?? '' }
        return { ...run, status, errorCode: details.errorCode ?? null }
      },
      claimNextQueuedRun: async () => ({ ...run }),
    },
    invitations: {
      expirePending: async () => {
        invitationCleanupCount += 1
        return 0
      },
    },
    getCompletionInput: () => completionInput,
    getFailedRun: () => failedRun,
    getInvitationCleanupCount: () => invitationCleanupCount,
  }
}

describe('simulation worker', () => {
  it('persists deterministic interval and summary batches and completes the run', async () => {
    const fixture = repositories()
    const completed = await executeClaimedSimulationRun(fixture, run)

    expect(completed).toMatchObject({ _id: run._id, status: 'completed', resultDigest: 'result-digest' })
    const input = fixture.getCompletionInput() as {
      runId: string
      resultDigest: string
      intervals: Array<{ householdId: string; outcome: string; intervalStart: Date }>
      summaries: Array<{ householdId: string; outcome: string }>
    }
    expect(input.runId).toBe(run._id)
    expect(input.resultDigest).toMatch(/^[a-f0-9]{64}$/)
    expect(input.intervals).toHaveLength(24 * 4)
    expect(input.summaries).toHaveLength(4)
    expect(input.intervals[0]).toMatchObject({
      householdId: 'household_1',
      outcome: 'p10',
      intervalStart: new Date('2030-01-01T00:00:00.000Z'),
    })
  })

  it('claims and processes the next queued run through the public worker seam', async () => {
    const fixture = repositories()
    const processed = await processNextSimulationRun(fixture)

    expect(processed).toMatchObject({ _id: run._id, status: 'completed' })
  })

  it('runs expired-invitation cleanup through the worker maintenance seam', async () => {
    const fixture = repositories()

    expect(await expirePendingInvitations(fixture)).toBe(0)
    expect(fixture.getInvitationCleanupCount()).toBe(1)
  })

  it('runs maintenance before the first simulation queue poll', async () => {
    const fixture = repositories()
    const controller = new AbortController()
    const claimNextQueuedRun = fixture.simulations.claimNextQueuedRun
    fixture.simulations.claimNextQueuedRun = async () => {
      controller.abort()
      return claimNextQueuedRun()
    }

    await runSimulationWorker(fixture, {
      signal: controller.signal,
      pollIntervalMs: 100,
      maintenanceIntervalMs: 1_000,
    })

    expect(fixture.getInvitationCleanupCount()).toBe(1)
  })

  it('marks invalid claimed input failed without exposing raw exception details', async () => {
    const fixture = repositories()
    const invalidRun = { ...run, inputSnapshot: { sampleCount: 0 } }

    const failed = await executeClaimedSimulationRun(fixture, invalidRun)

    expect(failed).toMatchObject({ _id: run._id, status: 'failed', errorCode: 'INVALID_SIMULATION_INPUT' })
    expect(fixture.getFailedRun()).toEqual({ id: run._id, errorCode: 'INVALID_SIMULATION_INPUT' })
  })

  it('fails a run when its frozen input digest no longer matches the snapshot', async () => {
    const fixture = repositories()
    const tamperedRun = { ...run, inputDigest: 'tampered-digest' }

    const failed = await executeClaimedSimulationRun(fixture, tamperedRun)

    expect(failed).toMatchObject({ status: 'failed', errorCode: 'SIMULATION_INPUT_DIGEST_MISMATCH' })
    expect(fixture.getFailedRun()).toEqual({ id: run._id, errorCode: 'SIMULATION_INPUT_DIGEST_MISMATCH' })
  })

  it('leaves persistence failures retryable instead of permanently failing the run', async () => {
    const fixture = repositories()
    fixture.simulations.completeRun = async () => {
      throw new Error('Mongo network timeout')
    }

    await expect(executeClaimedSimulationRun(fixture, run)).rejects.toThrow('Mongo network timeout')
    expect(fixture.getFailedRun()).toBeUndefined()
  })
})
