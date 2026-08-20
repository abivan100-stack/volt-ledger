import { expect, it } from 'vitest'
import { describeIntegration } from './runner.js'

/**
 * Heartbeat storage, verified against a real MongoDB.
 *
 * The heartbeat is written as an upsert keyed by the worker's identity, so a
 * long-running worker leaves one row rather than an ever-growing stream. That is
 * a property of the update itself, which a stub cannot demonstrate.
 */

const WORKER = 'volt-worker'

function beat(overrides: Record<string, unknown> = {}) {
  return {
    workerId: WORKER,
    status: 'healthy' as const,
    startedAt: new Date('2030-01-01T00:00:00.000Z'),
    updatedAt: new Date('2030-01-01T00:00:10.000Z'),
    lastSuccessAt: new Date('2030-01-01T00:00:10.000Z'),
    consecutiveFailures: 0,
    processedCount: 3,
    lastErrorCode: null,
    ...overrides,
  }
}

describeIntegration('Worker heartbeats', (suite) => {
  it('creates the row on the first beat', async () => {
    const recorded = await suite.repositories().workers.recordHeartbeat(beat())

    expect(recorded._id).toBe(WORKER)
    expect(recorded.status).toBe('healthy')
    expect(recorded.processedCount).toBe(3)
  })

  it('rewrites the same row rather than appending', async () => {
    const repositories = suite.repositories()

    await repositories.workers.recordHeartbeat(beat())
    await repositories.workers.recordHeartbeat(
      beat({
        status: 'degraded',
        updatedAt: new Date('2030-01-01T00:01:00.000Z'),
        consecutiveFailures: 2,
        lastErrorCode: 'MONGO_UNAVAILABLE',
      }),
    )

    const stored = await suite.collections().workerHeartbeats.find({}).toArray()
    expect(stored).toHaveLength(1)
    expect(stored[0]?.status).toBe('degraded')
    expect(stored[0]?.consecutiveFailures).toBe(2)
    expect(stored[0]?.lastErrorCode).toBe('MONGO_UNAVAILABLE')
  })

  it('moves the start time forward when the process restarts', async () => {
    const repositories = suite.repositories()

    await repositories.workers.recordHeartbeat(beat())
    const restarted = await repositories.workers.recordHeartbeat(
      beat({
        status: 'starting',
        startedAt: new Date('2030-01-02T00:00:00.000Z'),
        updatedAt: new Date('2030-01-02T00:00:00.000Z'),
        lastSuccessAt: null,
        processedCount: 0,
      }),
    )

    // A restart is visible precisely because the start time changed.
    expect(restarted.startedAt.toISOString()).toBe('2030-01-02T00:00:00.000Z')
    expect(restarted.lastSuccessAt).toBeNull()
    expect(restarted.processedCount).toBe(0)
  })

  it('keeps separate rows for separate workers', async () => {
    const repositories = suite.repositories()

    await repositories.workers.recordHeartbeat(beat())
    await repositories.workers.recordHeartbeat(beat({ workerId: 'volt-worker-2', processedCount: 9 }))

    const first = await repositories.workers.findHeartbeat(WORKER)
    const second = await repositories.workers.findHeartbeat('volt-worker-2')
    expect(first?.processedCount).toBe(3)
    expect(second?.processedCount).toBe(9)
  })

  it('lists the most recently heard from first', async () => {
    const repositories = suite.repositories()

    await repositories.workers.recordHeartbeat(
      beat({ workerId: 'quiet', updatedAt: new Date('2030-01-01T00:00:00.000Z') }),
    )
    await repositories.workers.recordHeartbeat(
      beat({ workerId: 'recent', updatedAt: new Date('2030-01-01T01:00:00.000Z') }),
    )

    const listed = await repositories.workers.listHeartbeats()
    expect(listed.map((entry) => entry._id)).toEqual(['recent', 'quiet'])
  })

  it('reports an unknown worker as absent rather than failing', async () => {
    expect(await suite.repositories().workers.findHeartbeat('never-ran')).toBeNull()
  })
})
