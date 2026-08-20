import { describe, expect, it, vi } from 'vitest'
import type { SimulationRunDocument } from '../db/models.js'
import { createLogger } from '../observability/logger.js'
import { runSimulationWorker } from './worker.js'

/**
 * The worker loop's behaviour when things go wrong.
 *
 * The loop previously had no error handling: one transient Mongo failure escaped
 * it and killed the process, so the retry its own comment promised never
 * happened. These tests pin the opposite — the loop survives, paces itself, and
 * says what occurred.
 */

const RUN: SimulationRunDocument = {
  _id: 'run_1',
  organisationId: 'org_1',
  requestedByUserId: 'user_1',
  seed: 'seed-1',
  modelVersion: 'test-model',
  inputSnapshot: {},
  inputDigest: 'digest',
  status: 'running',
  attemptCount: 0,
  createdAt: new Date('2030-01-01T00:00:00.000Z'),
  startedAt: new Date('2030-01-01T00:00:00.000Z'),
  completedAt: null,
  resultDigest: null,
  errorCode: null,
  deletedAt: null,
}

function capture() {
  const lines: Record<string, unknown>[] = []
  const logger = createLogger({
    service: 'volt-worker',
    level: 'debug',
    sink: (line) => lines.push(JSON.parse(line) as Record<string, unknown>),
  })
  return { lines, logger, events: () => lines.map((line) => line.event as string) }
}

/**
 * Runs the loop for a fixed number of iterations, then aborts. `sleep` is
 * injected so nothing waits on a real timer.
 */
function harness(options: {
  claim: () => Promise<SimulationRunDocument | null>
  expirePending?: () => Promise<number>
  iterations?: number
}) {
  const controller = new AbortController()
  const sleeps: number[] = []
  let iterations = 0
  const limit = options.iterations ?? 3

  const repositories = {
    simulations: {
      claimNextQueuedRun: async () => {
        iterations += 1
        if (iterations >= limit) controller.abort()
        return options.claim()
      },
      completeRun: async () => ({ ...RUN, status: 'completed' as const }),
      transitionRun: async () => ({ ...RUN, status: 'failed' as const }),
    },
    invitations: {
      expirePending: options.expirePending ?? (async () => 0),
    },
  }

  return {
    controller,
    sleeps,
    repositories,
    run: (logger?: ReturnType<typeof capture>['logger']) =>
      runSimulationWorker(repositories as never, {
        signal: controller.signal,
        pollIntervalMs: 1_000,
        maintenanceIntervalMs: 60_000,
        logger,
        // Record the pacing instead of waiting for it.
        sleep: async (ms: number) => {
          sleeps.push(ms)
        },
        random: () => 1,
      }),
  }
}

describe('transient failures', () => {
  it('does not exit when claiming throws', async () => {
    const fixture = harness({
      claim: async () => {
        throw new Error('Mongo network timeout')
      },
      iterations: 4,
    })

    // The whole point: this resolves rather than rejecting.
    await expect(fixture.run()).resolves.toBeUndefined()
  })

  it('reports the failure with its cause and keeps going', async () => {
    const { logger, lines, events } = capture()
    const fixture = harness({
      claim: async () => {
        throw new Error('Mongo network timeout')
      },
      iterations: 3,
    })

    await fixture.run(logger)

    expect(events()).toContain('worker.poll_failed')
    const failure = lines.find((line) => line.event === 'worker.poll_failed')
    expect(failure).toBeDefined()
    expect((failure?.error as { message: string } | undefined)?.message).toBe('Mongo network timeout')
    expect(failure?.consecutiveFailures).toBe(1)
  })

  it('backs off further on each consecutive failure', async () => {
    const fixture = harness({
      claim: async () => {
        throw new Error('Mongo network timeout')
      },
      iterations: 4,
    })

    await fixture.run()

    // Doubling, not a fixed poll interval. The abort is raised inside the claim,
    // so that final iteration still completes and pays its backoff.
    expect(fixture.sleeps).toEqual([1_000, 2_000, 4_000, 8_000])
  })

  it('resets the backoff once a poll succeeds', async () => {
    let call = 0
    const fixture = harness({
      claim: async () => {
        call += 1
        if (call <= 2) throw new Error('Mongo network timeout')
        return null
      },
      iterations: 5,
    })

    await fixture.run()

    // Two escalating failures, then a clean poll returns to the base interval
    // rather than continuing to escalate.
    expect(fixture.sleeps).toEqual([1_000, 2_000, 1_000, 1_000, 1_000])
  })

  it('does not sleep at all when a run was processed', async () => {
    const fixture = harness({ claim: async () => ({ ...RUN }), iterations: 3 })

    await fixture.run()

    // Work available means poll again immediately rather than idle.
    expect(fixture.sleeps).toEqual([])
  })
})

describe('maintenance failures', () => {
  it('does not take simulation processing down with it', async () => {
    const { logger, events } = capture()
    const fixture = harness({
      claim: async () => null,
      expirePending: async () => {
        throw new Error('maintenance exploded')
      },
      iterations: 3,
    })

    await expect(fixture.run(logger)).resolves.toBeUndefined()
    expect(events()).toContain('maintenance.failed')
  })

  it('waits a full interval before trying maintenance again, rather than hot-looping', async () => {
    const expirePending = vi.fn(async () => {
      throw new Error('maintenance exploded')
    })
    const fixture = harness({ claim: async () => null, expirePending, iterations: 5 })

    await fixture.run()

    // The schedule advances even though the attempt failed.
    expect(expirePending).toHaveBeenCalledTimes(1)
  })

  it('reports how many invitations it expired', async () => {
    const { logger, lines } = capture()
    const fixture = harness({
      claim: async () => null,
      expirePending: async () => 3,
      iterations: 2,
    })

    await fixture.run(logger)

    const entry = lines.find((line) => line.event === 'maintenance.invitations_expired')
    expect(entry?.expired).toBe(3)
  })
})

describe('lifecycle logging', () => {
  it('records start and stop', async () => {
    const { logger, events } = capture()
    const fixture = harness({ claim: async () => null, iterations: 2 })

    await fixture.run(logger)

    expect(events()).toContain('worker.started')
    expect(events()).toContain('worker.stopped')
  })

  it('attaches the run and organisation to every entry about a run', async () => {
    const { logger, lines } = capture()
    const fixture = harness({ claim: async () => ({ ...RUN }), iterations: 2 })

    await fixture.run(logger)

    const claimed = lines.find((line) => line.event === 'simulation.claimed')
    expect(claimed?.runId).toBe('run_1')
    expect(claimed?.organisationId).toBe('org_1')

    // The fixture's modelVersion is deliberately unsupported, so this run ends
    // permanently failed — which is exactly the path worth seeing logged.
    const finished = lines.find((line) => line.event === 'simulation.finished')
    expect(finished?.runId).toBe('run_1')
    expect(finished?.organisationId).toBe('org_1')
    expect(finished?.status).toBe('failed')
    expect(typeof finished?.durationMs).toBe('number')

    const permanent = lines.find((line) => line.event === 'simulation.permanently_failed')
    expect(permanent?.errorCode).toBe('UNSUPPORTED_MODEL_VERSION')
    expect(permanent?.runId).toBe('run_1')
  })

  it('runs silently when given no logger', async () => {
    const fixture = harness({ claim: async () => null, iterations: 2 })
    await expect(fixture.run()).resolves.toBeUndefined()
  })
})

describe('shutdown', () => {
  it('stops promptly once aborted', async () => {
    const controller = new AbortController()
    const claim = vi.fn(async () => null)
    controller.abort()

    await runSimulationWorker(
      {
        simulations: { claimNextQueuedRun: claim, completeRun: vi.fn(), transitionRun: vi.fn() },
        invitations: { expirePending: vi.fn(async () => 0) },
      } as never,
      { signal: controller.signal, sleep: async () => undefined },
    )

    // Already aborted, so no work is claimed at all.
    expect(claim).not.toHaveBeenCalled()
  })
})
