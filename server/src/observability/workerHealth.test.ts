import { describe, expect, it } from 'vitest'
import {
  createWorkerHealth,
  deriveWorkerLiveness,
  describeErrorCode,
  isWorkerReady,
  WORKER_HEARTBEAT_STALE_AFTER_MS,
} from './workerHealth.js'

/**
 * The worker's own account of whether it is working.
 *
 * The worker runs in its own process with no HTTP surface, so the only evidence
 * it is alive is what it records. Liveness and health are deliberately separate:
 * a worker that is failing every poll is still alive, and saying so is the point
 * — the failure is visible rather than indistinguishable from a dead process.
 */

function clock(start = '2030-01-01T00:00:00.000Z') {
  let current = new Date(start).getTime()
  return {
    now: () => new Date(current),
    advance: (milliseconds: number) => {
      current += milliseconds
    },
  }
}

describe('createWorkerHealth', () => {
  it('starts before it has proved anything', () => {
    const time = clock()
    const health = createWorkerHealth({ now: time.now })

    const snapshot = health.snapshot()
    expect(snapshot.status).toBe('starting')
    expect(snapshot.startedAt.toISOString()).toBe('2030-01-01T00:00:00.000Z')
    expect(snapshot.lastSuccessAt).toBeNull()
    expect(snapshot.consecutiveFailures).toBe(0)
    expect(snapshot.processedCount).toBe(0)
    expect(snapshot.lastErrorCode).toBeNull()
  })

  it('becomes healthy once a poll succeeds', () => {
    const time = clock()
    const health = createWorkerHealth({ now: time.now })

    time.advance(1_000)
    health.pollSucceeded()

    const snapshot = health.snapshot()
    expect(snapshot.status).toBe('healthy')
    expect(snapshot.lastSuccessAt?.toISOString()).toBe('2030-01-01T00:00:01.000Z')
    expect(snapshot.updatedAt.toISOString()).toBe('2030-01-01T00:00:01.000Z')
  })

  it('counts only the polls that processed a run', () => {
    const health = createWorkerHealth({ now: clock().now })

    health.pollSucceeded({ processed: true })
    health.pollSucceeded()
    health.pollSucceeded({ processed: false })
    health.pollSucceeded({ processed: true })

    // An idle poll is a successful poll; it is not work done.
    expect(health.snapshot().processedCount).toBe(2)
  })

  it('degrades while polls are failing and counts them', () => {
    const health = createWorkerHealth({ now: clock().now })

    health.pollFailed(new Error('MONGO_UNAVAILABLE'))
    expect(health.snapshot().status).toBe('degraded')
    expect(health.snapshot().consecutiveFailures).toBe(1)

    health.pollFailed(new Error('MONGO_UNAVAILABLE'))
    expect(health.snapshot().consecutiveFailures).toBe(2)
  })

  it('recovers on the next success and forgets the failure streak', () => {
    const time = clock()
    const health = createWorkerHealth({ now: time.now })

    health.pollFailed(new Error('MONGO_UNAVAILABLE'))
    time.advance(5_000)
    health.pollSucceeded()

    const snapshot = health.snapshot()
    expect(snapshot.status).toBe('healthy')
    expect(snapshot.consecutiveFailures).toBe(0)
    // The last error is kept: a recovery is worth seeing alongside what preceded it.
    expect(snapshot.lastErrorCode).toBe('MONGO_UNAVAILABLE')
  })

  it('keeps the last success time when a later poll fails', () => {
    const time = clock()
    const health = createWorkerHealth({ now: time.now })

    health.pollSucceeded()
    time.advance(30_000)
    health.pollFailed(new Error('MONGO_UNAVAILABLE'))

    const snapshot = health.snapshot()
    expect(snapshot.lastSuccessAt?.toISOString()).toBe('2030-01-01T00:00:00.000Z')
    expect(snapshot.updatedAt.toISOString()).toBe('2030-01-01T00:00:30.000Z')
  })

  it('reports stopped once the loop exits, whatever it was doing', () => {
    const health = createWorkerHealth({ now: clock().now })

    health.pollFailed(new Error('MONGO_UNAVAILABLE'))
    health.stop()

    expect(health.snapshot().status).toBe('stopped')
    // The streak is evidence about why it stopped, so it survives.
    expect(health.snapshot().consecutiveFailures).toBe(1)
  })

  it('hands out snapshots that later changes cannot mutate', () => {
    const health = createWorkerHealth({ now: clock().now })

    const before = health.snapshot()
    health.pollSucceeded({ processed: true })

    expect(before.status).toBe('starting')
    expect(before.processedCount).toBe(0)
  })
})

describe('describeErrorCode', () => {
  it('prefers an explicit error code', () => {
    const error = Object.assign(new Error('connection refused'), { code: 'ECONNREFUSED' })
    expect(describeErrorCode(error)).toBe('ECONNREFUSED')
  })

  it('accepts a numeric code', () => {
    const error = Object.assign(new Error('failed'), { code: 13 })
    expect(describeErrorCode(error)).toBe('13')
  })

  it('uses the message when the message is itself a code', () => {
    expect(describeErrorCode(new Error('UNSUPPORTED_MODEL_VERSION'))).toBe('UNSUPPORTED_MODEL_VERSION')
  })

  it('falls back to the error name rather than a free-form message', () => {
    // The code is persisted, and a driver message can quote a connection string.
    const error = new Error('failed to connect to mongodb+srv://user:pw@cluster.example.net')
    expect(describeErrorCode(error)).toBe('Error')
    expect(describeErrorCode(error)).not.toContain('cluster.example.net')
  })

  it('never returns an arbitrary string thrown as an error', () => {
    expect(describeErrorCode('mongodb+srv://user:pw@cluster.example.net')).toBe('UNKNOWN')
    expect(describeErrorCode(null)).toBe('UNKNOWN')
    expect(describeErrorCode({ message: 'secret-bearing text' })).toBe('UNKNOWN')
  })
})

describe('isWorkerReady', () => {
  it('is ready only once a poll has succeeded and none are failing', () => {
    const health = createWorkerHealth({ now: clock().now })
    expect(isWorkerReady(health.snapshot())).toBe(false)

    health.pollSucceeded()
    expect(isWorkerReady(health.snapshot())).toBe(true)

    health.pollFailed(new Error('MONGO_UNAVAILABLE'))
    expect(isWorkerReady(health.snapshot())).toBe(false)

    health.stop()
    expect(isWorkerReady(health.snapshot())).toBe(false)
  })
})

describe('deriveWorkerLiveness', () => {
  const now = new Date('2030-01-01T00:10:00.000Z')

  it('treats a recently updated worker as live', () => {
    const updatedAt = new Date(now.getTime() - 1_000)
    expect(deriveWorkerLiveness({ status: 'healthy', updatedAt }, { now })).toBe('live')
  })

  it('treats a failing worker as live, because it is still reporting', () => {
    const updatedAt = new Date(now.getTime() - 1_000)
    expect(deriveWorkerLiveness({ status: 'degraded', updatedAt }, { now })).toBe('live')
  })

  it('treats a worker that stopped saying anything as stale', () => {
    const updatedAt = new Date(now.getTime() - WORKER_HEARTBEAT_STALE_AFTER_MS - 1)
    expect(deriveWorkerLiveness({ status: 'healthy', updatedAt }, { now })).toBe('stale')
  })

  it('honours a caller-supplied staleness window', () => {
    const updatedAt = new Date(now.getTime() - 5_000)
    expect(deriveWorkerLiveness({ status: 'healthy', updatedAt }, { now, staleAfterMs: 1_000 })).toBe('stale')
    expect(deriveWorkerLiveness({ status: 'healthy', updatedAt }, { now, staleAfterMs: 10_000 })).toBe('live')
  })

  it('reports a clean shutdown as stopped rather than as a failure', () => {
    const updatedAt = new Date(now.getTime() - 1_000)
    expect(deriveWorkerLiveness({ status: 'stopped', updatedAt }, { now })).toBe('stopped')
  })

  it('still reports a long-departed worker as stopped when it said so', () => {
    const updatedAt = new Date(now.getTime() - WORKER_HEARTBEAT_STALE_AFTER_MS - 1)
    expect(deriveWorkerLiveness({ status: 'stopped', updatedAt }, { now })).toBe('stopped')
  })
})
