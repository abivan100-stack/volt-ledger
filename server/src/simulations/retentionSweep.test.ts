import { describe, expect, it, vi } from 'vitest'
import { createLogger } from '../observability/logger.js'
import { runSimulationWorker } from './worker.js'

/**
 * The purge runs on the worker's maintenance tick, beside the invitation sweep.
 *
 * It must be optional and it must be quiet: a worker configured without a
 * retention window does not purge at all, and a sweep that finds nothing says
 * nothing, because the normal case is nothing to do and it runs every interval.
 */

function capture() {
  const lines: Record<string, unknown>[] = []
  const logger = createLogger({
    service: 'volt-worker',
    level: 'debug',
    sink: (line) => lines.push(JSON.parse(line) as Record<string, unknown>),
  })
  return {
    logger,
    lines,
    events: () => lines.map((line) => line.event as string),
    find: (event: string) => lines.find((line) => line.event === event),
  }
}

function harness(options: {
  purge?: ReturnType<typeof vi.fn>
  retentionWindowDays?: number
  withRetention?: boolean
}) {
  const controller = new AbortController()
  let iterations = 0

  const purge =
    options.purge ??
    vi.fn(async () => ({
      organisationsPurged: 0,
      runsDeleted: 0,
      intervalsDeleted: 0,
      summariesDeleted: 0,
    }))

  const repositories = {
    simulations: {
      claimNextQueuedRun: async () => {
        iterations += 1
        if (iterations >= 2) controller.abort()
        return null
      },
      completeRun: async () => null,
      transitionRun: async () => null,
    },
    invitations: { expirePending: async () => 0 },
    ...(options.withRetention === false ? {} : { retention: { purgeArchivedBefore: purge } }),
  }

  return {
    purge,
    run: (logger?: ReturnType<typeof capture>['logger']) =>
      runSimulationWorker(repositories as never, {
        signal: controller.signal,
        sleep: async () => undefined,
        ...(options.retentionWindowDays === undefined
          ? {}
          : { retentionWindowDays: options.retentionWindowDays }),
        ...(logger ? { logger } : {}),
      }),
  }
}

describe('retention sweep', () => {
  it('purges with a cutoff a window back from now', async () => {
    const test = harness({ retentionWindowDays: 30 })

    await test.run()

    expect(test.purge).toHaveBeenCalledTimes(1)
    const cutoff = test.purge.mock.calls[0]?.[0] as Date
    const daysBack = (Date.now() - cutoff.getTime()) / (24 * 60 * 60 * 1000)
    expect(daysBack).toBeGreaterThan(29.9)
    expect(daysBack).toBeLessThan(30.1)
  })

  it('does not purge when no window is configured', async () => {
    const test = harness({})

    await test.run()

    // Absent configuration must mean "do nothing", never a default that starts
    // deleting data nobody asked it to.
    expect(test.purge).not.toHaveBeenCalled()
  })

  it('does not purge when the repository is not wired', async () => {
    const test = harness({ retentionWindowDays: 30, withRetention: false })

    await expect(test.run()).resolves.toBeUndefined()
  })

  it('says what it removed', async () => {
    const purge = vi.fn(async () => ({
      organisationsPurged: 2,
      runsDeleted: 7,
      intervalsDeleted: 8640,
      summariesDeleted: 12,
    }))
    const logged = capture()
    const test = harness({ retentionWindowDays: 30, purge })

    await test.run(logged.logger)

    const entry = logged.find('maintenance.retention_purged')
    expect(entry).toMatchObject({ organisations: 2, runs: 7, intervals: 8640, summaries: 12 })
  })

  it('stays quiet when there was nothing to remove', async () => {
    const logged = capture()
    const test = harness({ retentionWindowDays: 30 })

    await test.run(logged.logger)

    expect(logged.events()).not.toContain('maintenance.retention_purged')
  })

  it('keeps processing runs when the purge fails', async () => {
    const purge = vi.fn(async () => {
      throw new Error('MONGO_UNAVAILABLE')
    })
    const logged = capture()
    const test = harness({ retentionWindowDays: 30, purge })

    await test.run(logged.logger)

    // Maintenance is independent of the queue.
    expect(logged.events()).toContain('maintenance.failed')
    expect(logged.events()).not.toContain('worker.poll_failed')
    expect(logged.events()).toContain('worker.stopped')
  })
})
