import type { WorkerHealthStatus } from '../db/models.js'

/**
 * The worker's view of its own condition.
 *
 * Kept free of I/O so the rules are testable on their own: the loop updates this
 * as it goes, and something else decides where a snapshot is written. Health and
 * liveness are distinct — a worker failing every poll is unhealthy but very much
 * alive, and that difference is what tells an operator whether to look at the
 * database or at the process.
 */

/** How long a heartbeat stays believable before its worker is presumed gone. */
export const WORKER_HEARTBEAT_STALE_AFTER_MS = 90_000

export interface WorkerHealthSnapshot {
  status: WorkerHealthStatus
  startedAt: Date
  updatedAt: Date
  /** When a poll last came back at all, successful or empty. */
  lastSuccessAt: Date | null
  consecutiveFailures: number
  /** Runs carried to a terminal state by this process since it started. */
  processedCount: number
  lastErrorCode: string | null
}

export interface WorkerHealth {
  pollSucceeded(options?: { processed?: boolean }): void
  pollFailed(error: unknown): void
  stop(): void
  snapshot(): WorkerHealthSnapshot
}

/** Codes look like THIS_SHAPE; anything else is treated as prose. */
const CODE_PATTERN = /^[A-Z][A-Z0-9_]*$/

/**
 * A short, safe label for what went wrong.
 *
 * Deliberately never a free-form message. The result is persisted and read back
 * by other services, and driver errors routinely quote the connection string
 * that failed — which is a credential. An explicit `code` is preferred, a
 * message is only used when it is itself a code, and everything else degrades to
 * the error's class name.
 */
export function describeErrorCode(error: unknown): string {
  if (!(error instanceof Error)) return 'UNKNOWN'

  const code = (error as { code?: unknown }).code
  if (typeof code === 'string' && code.length > 0) return code
  if (typeof code === 'number') return String(code)

  if (CODE_PATTERN.test(error.message)) return error.message
  return error.name.length > 0 ? error.name : 'UNKNOWN'
}

export function createWorkerHealth(options: { now?: () => Date } = {}): WorkerHealth {
  const now = options.now ?? ((): Date => new Date())
  const startedAt = now()

  let status: WorkerHealthStatus = 'starting'
  let updatedAt = startedAt
  let lastSuccessAt: Date | null = null
  let consecutiveFailures = 0
  let processedCount = 0
  let lastErrorCode: string | null = null

  return {
    pollSucceeded(pollOptions = {}) {
      if (status === 'stopped') return
      updatedAt = now()
      lastSuccessAt = updatedAt
      consecutiveFailures = 0
      status = 'healthy'
      if (pollOptions.processed === true) processedCount += 1
    },

    pollFailed(error) {
      if (status === 'stopped') return
      updatedAt = now()
      consecutiveFailures += 1
      lastErrorCode = describeErrorCode(error)
      status = 'degraded'
    },

    stop() {
      updatedAt = now()
      status = 'stopped'
    },

    snapshot() {
      // A copy: callers hold these across awaits, and a snapshot that changed
      // underneath would describe a moment that never existed.
      return {
        status,
        startedAt,
        updatedAt,
        lastSuccessAt,
        consecutiveFailures,
        processedCount,
        lastErrorCode,
      }
    },
  }
}

/**
 * Whether the worker is currently able to take work.
 *
 * Stricter than liveness on purpose: a worker still failing its polls is running
 * but should not be counted on to drain the queue.
 */
export function isWorkerReady(snapshot: WorkerHealthSnapshot): boolean {
  return snapshot.status === 'healthy'
}

export type WorkerLiveness = 'live' | 'stale' | 'stopped'

/**
 * What a stored heartbeat says about the process that wrote it.
 *
 * A worker that shut down cleanly said so, and stays `stopped` however old the
 * record gets; silence is what produces `stale`, because a process that was
 * killed never got to write anything.
 */
export function deriveWorkerLiveness(
  heartbeat: { status: WorkerHealthStatus; updatedAt: Date },
  options: { now: Date; staleAfterMs?: number },
): WorkerLiveness {
  if (heartbeat.status === 'stopped') return 'stopped'

  const staleAfterMs = options.staleAfterMs ?? WORKER_HEARTBEAT_STALE_AFTER_MS
  const age = options.now.getTime() - heartbeat.updatedAt.getTime()
  return age > staleAfterMs ? 'stale' : 'live'
}
