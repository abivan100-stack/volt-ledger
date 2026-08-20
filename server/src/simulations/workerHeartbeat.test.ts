import { describe, expect, it } from 'vitest'
import type { SimulationRunDocument } from '../db/models.js'
import { createLogger } from '../observability/logger.js'
import type { WorkerHealthSnapshot } from '../observability/workerHealth.js'
import { runSimulationWorker } from './worker.js'

/**
 * What the loop tells the outside world about itself.
 *
 * The worker has no HTTP surface, so a heartbeat it writes is the only way to
 * distinguish "idle" from "dead". The sink is injected rather than reached for,
 * which keeps the loop unaware of storage and lets these tests observe every
 * beat without a database.
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
  attemptCount: 1,
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

interface HarnessOptions {
  claim: () => Promise<SimulationRunDocument | null>
  iterations?: number
  heartbeat?: (snapshot: WorkerHealthSnapshot) => Promise<void>
  heartbeatIntervalMs?: number
}

/**
 * Runs the loop for a fixed number of iterations, then aborts. Both `sleep` and
 * the heartbeat sink are injected, so nothing waits and every beat is recorded.
 */
function harness(options: HarnessOptions) {
  const controller = new AbortController()
  const beats: WorkerHealthSnapshot[] = []
  const order: string[] = []
  let iterations = 0
  const limit = options.iterations ?? 3

  const repositories = {
    simulations: {
      claimNextQueuedRun: async () => {
        iterations += 1
        order.push('claim')
        if (iterations >= limit) controller.abort()
        return options.claim()
      },
      completeRun: async () => ({ ...RUN, status: 'completed' as const }),
      transitionRun: async () => ({ ...RUN, status: 'failed' as const }),
    },
    invitations: {
      expirePending: async () => 0,
    },
  }

  const heartbeat = async (snapshot: WorkerHealthSnapshot): Promise<void> => {
    order.push(`heartbeat:${snapshot.status}`)
    beats.push(snapshot)
    if (options.heartbeat) await options.heartbeat(snapshot)
  }

  return {
    beats,
    order,
    statuses: () => beats.map((beat) => beat.status),
    run: (logger?: ReturnType<typeof capture>['logger']) =>
      runSimulationWorker(repositories as never, {
        signal: controller.signal,
        pollIntervalMs: 1_000,
        maintenanceIntervalMs: 60_000,
        heartbeatIntervalMs: options.heartbeatIntervalMs ?? 300_000,
        heartbeat,
        ...(logger ? { logger } : {}),
        sleep: async () => undefined,
      }),
  }
}

describe('worker heartbeat', () => {
  it('reports itself before it claims anything', async () => {
    const test = harness({ claim: async () => null, iterations: 2 })

    await test.run()

    // A worker that dies during startup must still have said it was starting.
    expect(test.order[0]).toBe('heartbeat:starting')
    expect(test.beats[0]?.lastSuccessAt).toBeNull()
  })

  it('reports healthy once a poll comes back', async () => {
    const test = harness({ claim: async () => null, iterations: 2 })

    await test.run()

    expect(test.statuses()).toContain('healthy')
  })

  it('counts the runs it has processed', async () => {
    const test = harness({ claim: async () => ({ ...RUN }), iterations: 3 })

    await test.run()

    const last = test.beats.at(-1)
    expect(last?.processedCount).toBeGreaterThan(0)
  })

  it('reports degraded, with the error code, while polls are failing', async () => {
    const test = harness({
      claim: async () => {
        throw new Error('MONGO_UNAVAILABLE')
      },
      iterations: 2,
    })

    await test.run()

    const degraded = test.beats.find((beat) => beat.status === 'degraded')
    expect(degraded).toBeDefined()
    expect(degraded?.lastErrorCode).toBe('MONGO_UNAVAILABLE')
    expect(degraded?.consecutiveFailures).toBeGreaterThan(0)
  })

  it('reports stopped as its last word', async () => {
    const test = harness({ claim: async () => null, iterations: 2 })

    await test.run()

    expect(test.statuses().at(-1)).toBe('stopped')
  })

  it('does not beat on every idle poll', async () => {
    const test = harness({ claim: async () => null, iterations: 6, heartbeatIntervalMs: 300_000 })

    await test.run()

    // Starting, the change to healthy, and the final stopped. The idle polls in
    // between change nothing and are not worth a write each.
    expect(test.statuses()).toEqual(['starting', 'healthy', 'stopped'])
  })

  it('beats on a status change even inside the throttle window', async () => {
    let calls = 0
    const test = harness({
      claim: async () => {
        calls += 1
        if (calls === 2) throw new Error('MONGO_UNAVAILABLE')
        return null
      },
      iterations: 4,
      heartbeatIntervalMs: 300_000,
    })

    await test.run()

    expect(test.statuses()).toEqual(['starting', 'healthy', 'degraded', 'healthy', 'stopped'])
  })

  it('survives a heartbeat sink that fails, and says so', async () => {
    const logged = capture()
    const test = harness({
      claim: async () => null,
      iterations: 3,
      heartbeat: async () => {
        throw new Error('HEARTBEAT_WRITE_FAILED')
      },
    })

    await test.run(logged.logger)

    // Recording health is not the job; doing the work is.
    expect(logged.events()).toContain('worker.heartbeat_failed')
    expect(logged.events()).toContain('worker.stopped')
    expect(logged.events()).not.toContain('worker.poll_failed')
  })

  it('runs unchanged when no sink is supplied', async () => {
    const controller = new AbortController()
    let iterations = 0
    const repositories = {
      simulations: {
        claimNextQueuedRun: async () => {
          iterations += 1
          if (iterations >= 2) controller.abort()
          return null
        },
        completeRun: async () => ({ ...RUN }),
        transitionRun: async () => ({ ...RUN }),
      },
      invitations: { expirePending: async () => 0 },
    }

    await expect(
      runSimulationWorker(repositories as never, {
        signal: controller.signal,
        sleep: async () => undefined,
      }),
    ).resolves.toBeUndefined()
  })
})
