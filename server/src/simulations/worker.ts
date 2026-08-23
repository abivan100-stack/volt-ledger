import type {
  EmailDeliveryDocument,
  SimulationRunDocument,
  SimulationStatus,
} from '../db/models.js'
import type {
  CompleteSimulationRunInput,
  VoltRepositories,
} from '../db/repositories.js'
import { createSilentLogger, type Logger } from '../observability/logger.js'
import {
  createWorkerHealth,
  type WorkerHealthSnapshot,
} from '../observability/workerHealth.js'
import { purgeCutoff } from '../retention/policy.js'
import { computeBackoffMs } from './backoff.js'
import { decryptDeliveryUrl } from '../email/outbox.js'
import { EmailDeliveryError, sendOrganisationInvitationEmail } from '../email/resend.js'
import {
  MONTE_CARLO_MODEL_VERSION,
  digestParsedSimulationInput,
  parseMonteCarloInput,
  runMonteCarlo,
} from './monteCarlo.js'

type SimulationWorkerRepositories = {
  simulations: Pick<
    VoltRepositories['simulations'],
    'claimNextQueuedRun' | 'completeRun' | 'transitionRun'
  >
}

type RetentionWorkerRepositories = {
  retention: Pick<VoltRepositories['retention'], 'purgeArchivedBefore'>
}

type InvitationWorkerRepositories = {
  invitations: Pick<VoltRepositories['invitations'], 'expirePending'>
}

type EmailWorkerRepositories = {
  emailDeliveries: Pick<VoltRepositories['emailDeliveries'], 'claimNext' | 'markSent' | 'markFailed'>
}

/** Error code recorded on a run that exhausted its attempt budget. */
export const SIMULATION_MAX_ATTEMPTS_ERROR = 'SIMULATION_MAX_ATTEMPTS_EXCEEDED'

export interface SimulationExecutionOptions {
  /** Claims allowed before the run is quarantined. Omit to disable the check. */
  maxAttempts?: number
}

export interface EmailDeliveryExecutionOptions {
  maxAttempts?: number
  retryBaseMs?: number
  retryMaxMs?: number
  leaseMs?: number
  random?: () => number
  sender?: (input: Parameters<typeof sendOrganisationInvitationEmail>[0]) => Promise<void>
}

function emailErrorDetails(error: unknown): { code: string; retryable: boolean } {
  if (error instanceof EmailDeliveryError) return { code: error.code, retryable: error.retryable }
  if (error instanceof Error && error.message === 'EMAIL_DELIVERY_PAYLOAD_INVALID') {
    return { code: error.message, retryable: false }
  }
  return { code: 'EMAIL_DELIVERY_RETRYABLE_FAILURE', retryable: true }
}

export async function processNextEmailDelivery(
  repositories: EmailWorkerRepositories,
  logger: Logger = createSilentLogger(),
  options: EmailDeliveryExecutionOptions = {},
): Promise<EmailDeliveryDocument | null> {
  const claimed = await repositories.emailDeliveries.claimNext(new Date(), options.leaseMs)
  if (!claimed) return null

  const scoped = logger.child({ deliveryId: claimed._id, idempotencyKey: claimed.idempotencyKey })
  const now = new Date()
  try {
    const url = decryptDeliveryUrl(claimed.encryptedUrl)
    const sender = options.sender ?? sendOrganisationInvitationEmail
    await sender({
      to: claimed.to,
      organisationName: claimed.organisationName,
      role: claimed.role,
      url,
      idempotencyKey: claimed.idempotencyKey,
    })
    await repositories.emailDeliveries.markSent(claimed._id, now)
    scoped.info('email_delivery.sent', { attemptCount: claimed.attemptCount })
    return { ...claimed, status: 'sent', lockedUntil: null, sentAt: now, updatedAt: now }
  } catch (error) {
    const details = emailErrorDetails(error)
    const maxAttempts = options.maxAttempts ?? 5
    const terminal = !details.retryable || claimed.attemptCount >= maxAttempts
    const retryDelay = computeBackoffMs(claimed.attemptCount, {
      baseMs: options.retryBaseMs ?? 1_000,
      maxMs: options.retryMaxMs ?? 600_000,
      randomSample: (options.random ?? Math.random)(),
    })
    const nextAttemptAt = terminal ? now : new Date(now.getTime() + retryDelay)
    await repositories.emailDeliveries.markFailed(claimed._id, nextAttemptAt, details.code, terminal)
    scoped[terminal ? 'error' : 'warn']('email_delivery.failed', {
      attemptCount: claimed.attemptCount,
      errorCode: details.code,
      terminal,
      nextAttemptAt: nextAttemptAt.toISOString(),
    })
    return {
      ...claimed,
      status: terminal ? 'failed' : 'pending',
      lockedUntil: null,
      lastErrorCode: details.code,
      nextAttemptAt,
      updatedAt: now,
    }
  }
}

/**
 * Whether a run has been claimed more times than its budget allows.
 *
 * Documents written before attempts were counted have no `attemptCount`; those
 * are treated as a first attempt rather than as instantly poisonous.
 */
export function isQuarantined(run: SimulationRunDocument, maxAttempts: number): boolean {
  return (run.attemptCount ?? 0) > maxAttempts
}

function isPermanentSimulationError(error: unknown): error is Error {
  if (
    error instanceof Error &&
    ['INVALID_SIMULATION_INPUT', 'SIMULATION_INPUT_DIGEST_MISMATCH', 'UNSUPPORTED_MODEL_VERSION'].includes(error.message)
  ) {
    return true
  }
  return false
}

function buildCompletionInput(run: SimulationRunDocument): CompleteSimulationRunInput {
  if (run.modelVersion !== MONTE_CARLO_MODEL_VERSION) throw new Error('UNSUPPORTED_MODEL_VERSION')
  const parsedInput = parseMonteCarloInput(run.inputSnapshot)
  if (digestParsedSimulationInput(parsedInput) !== run.inputDigest) {
    throw new Error('SIMULATION_INPUT_DIGEST_MISMATCH')
  }
  const result = runMonteCarlo(parsedInput, run.seed)
  return {
    runId: run._id,
    resultDigest: result.resultDigest,
    intervals: result.intervals.map((interval) => ({
      organisationId: run.organisationId,
      runId: run._id,
      householdId: interval.householdId,
      intervalStart: new Date(interval.intervalStart),
      intervalEnd: new Date(interval.intervalEnd),
      generatedKwh: interval.generatedKwh,
      consumedKwh: interval.consumedKwh,
      importedKwh: interval.importedKwh,
      exportedKwh: interval.exportedKwh,
      estimatedCreditInr: interval.estimatedCreditInr,
      outcome: interval.outcome,
    })),
    summaries: result.summaries.map((summary) => ({
      organisationId: run.organisationId,
      runId: run._id,
      householdId: summary.householdId,
      outcome: summary.outcome,
      intervalCount: summary.intervalCount,
      generatedKwh: summary.generatedKwh,
      consumedKwh: summary.consumedKwh,
      importedKwh: summary.importedKwh,
      exportedKwh: summary.exportedKwh,
      estimatedCreditInr: summary.estimatedCreditInr,
    })),
  }
}

export async function executeClaimedSimulationRun(
  repositories: SimulationWorkerRepositories,
  run: SimulationRunDocument,
  logger: Logger = createSilentLogger(),
  options: SimulationExecutionOptions = {},
): Promise<SimulationRunDocument> {
  if (run.status !== 'running') throw new Error('SIMULATION_RUN_NOT_RUNNING')

  // Checked before any work: a run that keeps failing would otherwise be
  // reclaimed on every pass and block everything queued behind it.
  if (options.maxAttempts !== undefined && isQuarantined(run, options.maxAttempts)) {
    logger.error('simulation.quarantined', {
      attemptCount: run.attemptCount,
      maxAttempts: options.maxAttempts,
      errorCode: SIMULATION_MAX_ATTEMPTS_ERROR,
    })
    return repositories.simulations.transitionRun(run._id, 'failed', {
      errorCode: SIMULATION_MAX_ATTEMPTS_ERROR,
    })
  }

  let completionInput: CompleteSimulationRunInput
  try {
    completionInput = buildCompletionInput(run)
  } catch (error) {
    if (!isPermanentSimulationError(error)) throw error
    // The input can never become valid, so retrying would loop forever.
    logger.warn('simulation.permanently_failed', { errorCode: error.message, stage: 'input' })
    return repositories.simulations.transitionRun(run._id, 'failed', { errorCode: error.message })
  }

  try {
    return await repositories.simulations.completeRun(completionInput)
  } catch (error) {
    if (isPermanentSimulationError(error)) {
      logger.warn('simulation.permanently_failed', {
        errorCode: (error as Error).message,
        stage: 'persistence',
      })
      return repositories.simulations.transitionRun(run._id, 'failed', { errorCode: (error as Error).message })
    }
    // A Mongo/network failure must leave the lease running so a later worker poll
    // can retry it. The loop below is what guarantees that poll still happens.
    throw error
  }
}

export async function processNextSimulationRun(
  repositories: SimulationWorkerRepositories,
  logger: Logger = createSilentLogger(),
  options: SimulationExecutionOptions = {},
): Promise<SimulationRunDocument | null> {
  const claimed = await repositories.simulations.claimNextQueuedRun()
  if (!claimed) return null

  // Every line about this run carries its identity, so a failure can be traced
  // without correlating timestamps.
  const scoped = logger.child({ runId: claimed._id, organisationId: claimed.organisationId })
  scoped.info('simulation.claimed', {
    modelVersion: claimed.modelVersion,
    attemptCount: claimed.attemptCount,
  })

  const startedAt = Date.now()
  try {
    const finished = await executeClaimedSimulationRun(repositories, claimed, scoped, options)
    scoped.info('simulation.finished', {
      status: finished.status,
      errorCode: finished.errorCode,
      durationMs: Date.now() - startedAt,
    })
    return finished
  } catch (error) {
    scoped.error('simulation.retryable_failure', { error, durationMs: Date.now() - startedAt })
    throw error
  }
}

export async function expirePendingInvitations(
  repositories: InvitationWorkerRepositories,
): Promise<number> {
  return repositories.invitations.expirePending()
}

export interface SimulationWorkerOptions {
  pollIntervalMs?: number
  maintenanceIntervalMs?: number
  signal?: AbortSignal
  logger?: Logger
  /** Ceiling for retry backoff after consecutive failures. */
  maxBackoffMs?: number
  /** Claims allowed per run before it is quarantined as permanently failing. */
  maxAttempts?: number
  /** Days an archive stays recoverable. Omit to disable the purge sweep. */
  retentionWindowDays?: number
  /**
   * Where the worker publishes its condition. Injected rather than reached for,
   * so the loop stays unaware of storage and a failing sink cannot stop work.
   */
  heartbeat?: (snapshot: WorkerHealthSnapshot) => Promise<void>
  /** Shortest gap between two beats that say the same thing. */
  heartbeatIntervalMs?: number
  /** Injected in tests so pacing is observed rather than waited on. */
  sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>
  /** Jitter source. Operational only; nothing in the simulation model uses it. */
  random?: () => number
  /** Maximum attempts for a single queued email before quarantine. */
  emailMaxAttempts?: number
  emailRetryBaseMs?: number
  emailRetryMaxMs?: number
  emailLeaseMs?: number
  emailSender?: (input: Parameters<typeof sendOrganisationInvitationEmail>[0]) => Promise<void>
}

function waitForPoll(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.resolve()
  return new Promise((resolve) => {
    const onAbort = (): void => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, milliseconds)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

export async function runSimulationWorker(
  repositories: SimulationWorkerRepositories &
    InvitationWorkerRepositories &
    Partial<EmailWorkerRepositories> &
    Partial<RetentionWorkerRepositories>,
  options: SimulationWorkerOptions = {},
): Promise<void> {
  const pollIntervalMs = Math.min(Math.max(options.pollIntervalMs ?? 1_000, 100), 60_000)
  const maintenanceIntervalMs = Math.min(Math.max(options.maintenanceIntervalMs ?? 60_000, 1_000), 3_600_000)
  const maxBackoffMs = Math.min(Math.max(options.maxBackoffMs ?? 60_000, pollIntervalMs), 600_000)
  const heartbeatIntervalMs = Math.min(Math.max(options.heartbeatIntervalMs ?? 15_000, 1_000), 300_000)
  const logger = options.logger ?? createSilentLogger()
  const sleep = options.sleep ?? waitForPoll
  const random = options.random ?? Math.random
  const health = createWorkerHealth()

  logger.info('worker.started', {
    pollIntervalMs,
    maintenanceIntervalMs,
    maxBackoffMs,
    heartbeatIntervalMs,
    maxAttempts: options.maxAttempts ?? null,
  })

  let nextMaintenanceAt = 0
  let consecutiveFailures = 0
  let nextHeartbeatAt = 0
  let publishedStatus: WorkerHealthSnapshot['status'] | null = null

  /**
   * Publishes the current condition, subject to throttling.
   *
   * A change of status always goes out immediately — that is the part anyone is
   * waiting to see — while an unchanged status is rate-limited so an idle worker
   * does not write once per poll. Failures here are reported and dropped: the
   * heartbeat is a report about the work, never a precondition for it.
   */
  async function publishHeartbeat(force = false): Promise<void> {
    if (!options.heartbeat) return

    const snapshot = health.snapshot()
    const changed = snapshot.status !== publishedStatus
    if (!force && !changed && Date.now() < nextHeartbeatAt) return

    nextHeartbeatAt = Date.now() + heartbeatIntervalMs
    try {
      await options.heartbeat(snapshot)
      publishedStatus = snapshot.status
    } catch (error) {
      logger.error('worker.heartbeat_failed', { error, status: snapshot.status })
    }
  }

  // Published before the first claim, so a worker that dies during startup has
  // still left a record that it started.
  await publishHeartbeat(true)

  while (!options.signal?.aborted) {
    if (Date.now() >= nextMaintenanceAt) {
      // Advance the schedule before attempting it: a failing sweep must wait a
      // full interval rather than being retried on every pass of the loop.
      nextMaintenanceAt = Date.now() + maintenanceIntervalMs
      try {
        const expired = await expirePendingInvitations(repositories)
        if (expired > 0) logger.info('maintenance.invitations_expired', { expired })

        if (repositories.retention && options.retentionWindowDays !== undefined) {
          const cutoff = purgeCutoff(new Date(), options.retentionWindowDays)
          const purged = await repositories.retention.purgeArchivedBefore(cutoff)
          // Only reported when it did something: a sweep that finds nothing is
          // the normal case and would otherwise fill the log every interval.
          if (purged.organisationsPurged > 0) {
            logger.info('maintenance.retention_purged', {
              organisations: purged.organisationsPurged,
              runs: purged.runsDeleted,
              intervals: purged.intervalsDeleted,
              summaries: purged.summariesDeleted,
              cutoff: cutoff.toISOString(),
            })
          }
        }
      } catch (error) {
        // Maintenance is independent of the queue; its failure must not stop
        // simulations from being processed.
        logger.error('maintenance.failed', { error })
      }
    }

    try {
      const processedEmail = repositories.emailDeliveries
        ? await processNextEmailDelivery({ emailDeliveries: repositories.emailDeliveries }, logger, {
            maxAttempts: options.emailMaxAttempts,
            retryBaseMs: options.emailRetryBaseMs,
            retryMaxMs: options.emailRetryMaxMs,
            leaseMs: options.emailLeaseMs,
            random,
            sender: options.emailSender,
          })
        : null
      const processed = await processNextSimulationRun(repositories, logger, {
        ...(options.maxAttempts === undefined ? {} : { maxAttempts: options.maxAttempts }),
      })
      consecutiveFailures = 0
      // `processedCount` is a run counter, not a general work-item counter.
      // Invitation mail keeps the worker healthy but must not inflate it.
      health.pollSucceeded({ processed: processed !== null })
      await publishHeartbeat()
      if (!processed && !processedEmail) await sleep(pollIntervalMs, options.signal)
    } catch (error) {
      // The claim or the run failed in a way that may succeed later. Staying
      // alive is the whole point: the lease is left running, and this loop is
      // what comes back for it.
      consecutiveFailures += 1
      const retryInMs = computeBackoffMs(consecutiveFailures, {
        baseMs: pollIntervalMs,
        maxMs: maxBackoffMs,
        randomSample: random(),
      })
      logger.error('worker.poll_failed', { error, consecutiveFailures, retryInMs })
      health.pollFailed(error)
      await publishHeartbeat()
      await sleep(retryInMs, options.signal)
    }
  }

  health.stop()
  // Forced: a clean shutdown is what distinguishes a stopped worker from one
  // that was killed and simply went quiet.
  await publishHeartbeat(true)
  logger.info('worker.stopped', { consecutiveFailures })
}

export function isSimulationTerminalStatus(status: SimulationStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled'
}
