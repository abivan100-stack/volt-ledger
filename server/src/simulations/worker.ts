import type {
  SimulationRunDocument,
  SimulationStatus,
} from '../db/models.js'
import type {
  CompleteSimulationRunInput,
  VoltRepositories,
} from '../db/repositories.js'
import { createSilentLogger, type Logger } from '../observability/logger.js'
import { computeBackoffMs } from './backoff.js'
import {
  MONTE_CARLO_MODEL_VERSION,
  digestSimulationInput,
  parseMonteCarloInput,
  runMonteCarlo,
} from './monteCarlo.js'

type SimulationWorkerRepositories = {
  simulations: Pick<
    VoltRepositories['simulations'],
    'claimNextQueuedRun' | 'completeRun' | 'transitionRun'
  >
}

type InvitationWorkerRepositories = {
  invitations: Pick<VoltRepositories['invitations'], 'expirePending'>
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
  if (digestSimulationInput(parsedInput) !== run.inputDigest) {
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
): Promise<SimulationRunDocument> {
  if (run.status !== 'running') throw new Error('SIMULATION_RUN_NOT_RUNNING')

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
): Promise<SimulationRunDocument | null> {
  const claimed = await repositories.simulations.claimNextQueuedRun()
  if (!claimed) return null

  // Every line about this run carries its identity, so a failure can be traced
  // without correlating timestamps.
  const scoped = logger.child({ runId: claimed._id, organisationId: claimed.organisationId })
  scoped.info('simulation.claimed', { modelVersion: claimed.modelVersion })

  const startedAt = Date.now()
  try {
    const finished = await executeClaimedSimulationRun(repositories, claimed, scoped)
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
  /** Injected in tests so pacing is observed rather than waited on. */
  sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>
  /** Jitter source. Operational only; nothing in the simulation model uses it. */
  random?: () => number
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
  repositories: SimulationWorkerRepositories & InvitationWorkerRepositories,
  options: SimulationWorkerOptions = {},
): Promise<void> {
  const pollIntervalMs = Math.min(Math.max(options.pollIntervalMs ?? 1_000, 100), 60_000)
  const maintenanceIntervalMs = Math.min(Math.max(options.maintenanceIntervalMs ?? 60_000, 1_000), 3_600_000)
  const maxBackoffMs = Math.min(Math.max(options.maxBackoffMs ?? 60_000, pollIntervalMs), 600_000)
  const logger = options.logger ?? createSilentLogger()
  const sleep = options.sleep ?? waitForPoll
  const random = options.random ?? Math.random

  logger.info('worker.started', { pollIntervalMs, maintenanceIntervalMs, maxBackoffMs })

  let nextMaintenanceAt = 0
  let consecutiveFailures = 0

  while (!options.signal?.aborted) {
    if (Date.now() >= nextMaintenanceAt) {
      // Advance the schedule before attempting it: a failing sweep must wait a
      // full interval rather than being retried on every pass of the loop.
      nextMaintenanceAt = Date.now() + maintenanceIntervalMs
      try {
        const expired = await expirePendingInvitations(repositories)
        if (expired > 0) logger.info('maintenance.invitations_expired', { expired })
      } catch (error) {
        // Maintenance is independent of the queue; its failure must not stop
        // simulations from being processed.
        logger.error('maintenance.failed', { error })
      }
    }

    try {
      const processed = await processNextSimulationRun(repositories, logger)
      consecutiveFailures = 0
      if (!processed) await sleep(pollIntervalMs, options.signal)
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
      await sleep(retryInMs, options.signal)
    }
  }

  logger.info('worker.stopped', { consecutiveFailures })
}

export function isSimulationTerminalStatus(status: SimulationStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled'
}
