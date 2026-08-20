import { describe, expect, it, vi } from 'vitest'
import type { SimulationRunDocument } from '../db/models.js'
import { createLogger } from '../observability/logger.js'
import { SIMULATION_MAX_ATTEMPTS_ERROR, executeClaimedSimulationRun, isQuarantined } from './worker.js'

/**
 * The stop condition for a run that keeps failing.
 *
 * Retrying a transient failure forever is not resilience: `claimNextQueuedRun`
 * takes the oldest run first, so a run that always fails is reclaimed on every
 * pass and blocks everything queued behind it. After a bounded number of
 * attempts the run is moved to a terminal state, which both frees the queue and
 * makes the problem visible.
 */

function run(overrides: Partial<SimulationRunDocument> = {}): SimulationRunDocument {
  return {
    _id: 'run_1',
    organisationId: 'org_1',
    requestedByUserId: 'user_1',
    seed: 'seed-1',
    modelVersion: 'test-model',
    inputSnapshot: {},
    inputDigest: 'digest',
    status: 'running',
    attemptCount: 1,
    createdAt: new Date('2030-01-01T00:00:00.000Z'),
    startedAt: new Date('2030-01-01T00:00:00.000Z'),
    completedAt: null,
    resultDigest: null,
    errorCode: null,
    deletedAt: null,
    ...overrides,
  }
}

function capture() {
  const lines: Record<string, unknown>[] = []
  const logger = createLogger({
    service: 'volt-worker',
    level: 'debug',
    sink: (line) => lines.push(JSON.parse(line) as Record<string, unknown>),
  })
  return { lines, logger }
}

describe('isQuarantined', () => {
  it('allows a run still within its attempt budget', () => {
    expect(isQuarantined(run({ attemptCount: 1 }), 3)).toBe(false)
    expect(isQuarantined(run({ attemptCount: 3 }), 3)).toBe(false)
  })

  it('quarantines a run once it exceeds the budget', () => {
    expect(isQuarantined(run({ attemptCount: 4 }), 3)).toBe(true)
    expect(isQuarantined(run({ attemptCount: 99 }), 3)).toBe(true)
  })

  it('treats a document written before attempts were counted as a first attempt', () => {
    const legacy = run()
    delete (legacy as { attemptCount?: number }).attemptCount
    expect(isQuarantined(legacy, 3)).toBe(false)
  })
})

describe('executeClaimedSimulationRun quarantine', () => {
  function repositories() {
    const transitions: Array<{ id: string; status: string; errorCode?: string }> = []
    return {
      transitions,
      simulations: {
        claimNextQueuedRun: vi.fn(),
        completeRun: vi.fn(async () => run({ status: 'completed' })),
        transitionRun: vi.fn(async (id: string, status: string, details?: { errorCode?: string }) => {
          transitions.push({ id, status, errorCode: details?.errorCode })
          return run({ status: 'failed', errorCode: details?.errorCode ?? null })
        }),
      },
    }
  }

  it('fails a run that has exhausted its attempts, without running it again', async () => {
    const fixture = repositories()

    const result = await executeClaimedSimulationRun(
      fixture as never,
      run({ attemptCount: 6 }),
      undefined,
      { maxAttempts: 5 },
    )

    expect(result.status).toBe('failed')
    expect(fixture.transitions).toEqual([
      { id: 'run_1', status: 'failed', errorCode: SIMULATION_MAX_ATTEMPTS_ERROR },
    ])
    // The expensive part must not be attempted again.
    expect(fixture.simulations.completeRun).not.toHaveBeenCalled()
  })

  it('reports the quarantine with the counts that caused it', async () => {
    const { logger, lines } = capture()
    const fixture = repositories()

    await executeClaimedSimulationRun(fixture as never, run({ attemptCount: 6 }), logger, {
      maxAttempts: 5,
    })

    const entry = lines.find((line) => line.event === 'simulation.quarantined')
    expect(entry?.attemptCount).toBe(6)
    expect(entry?.maxAttempts).toBe(5)
    expect(entry?.errorCode).toBe(SIMULATION_MAX_ATTEMPTS_ERROR)
  })

  it('still processes a run inside its budget', async () => {
    const fixture = repositories()

    await executeClaimedSimulationRun(fixture as never, run({ attemptCount: 5 }), undefined, {
      maxAttempts: 5,
    })

    // Not quarantined, so it takes the normal path — which fails permanently
    // here only because the fixture's model version is unsupported.
    expect(fixture.transitions[0]?.errorCode).toBe('UNSUPPORTED_MODEL_VERSION')
  })

  it('leaves a run alone when no budget is configured', async () => {
    const fixture = repositories()

    await executeClaimedSimulationRun(fixture as never, run({ attemptCount: 1_000 }))

    expect(fixture.transitions[0]?.errorCode).toBe('UNSUPPORTED_MODEL_VERSION')
  })
})
