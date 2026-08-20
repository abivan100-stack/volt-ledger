import type {
  SimulationRunDocument,
  SimulationStatus,
} from '../db/models.js'
import type {
  CompleteSimulationRunInput,
  VoltRepositories,
} from '../db/repositories.js'
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
): Promise<SimulationRunDocument> {
  if (run.status !== 'running') throw new Error('SIMULATION_RUN_NOT_RUNNING')

  let completionInput: CompleteSimulationRunInput
  try {
    completionInput = buildCompletionInput(run)
  } catch (error) {
    if (!isPermanentSimulationError(error)) throw error
    return repositories.simulations.transitionRun(run._id, 'failed', { errorCode: error.message })
  }

  try {
    return await repositories.simulations.completeRun(completionInput)
  } catch (error) {
    if (isPermanentSimulationError(error)) {
      return repositories.simulations.transitionRun(run._id, 'failed', { errorCode: error.message })
    }
    // A Mongo/network failure must leave the lease running so a later worker poll can retry it.
    throw error
  }
}

export async function processNextSimulationRun(
  repositories: SimulationWorkerRepositories,
): Promise<SimulationRunDocument | null> {
  const claimed = await repositories.simulations.claimNextQueuedRun()
  if (!claimed) return null
  return executeClaimedSimulationRun(repositories, claimed)
}

export interface SimulationWorkerOptions {
  pollIntervalMs?: number
  signal?: AbortSignal
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
  repositories: SimulationWorkerRepositories,
  options: SimulationWorkerOptions = {},
): Promise<void> {
  const pollIntervalMs = Math.min(Math.max(options.pollIntervalMs ?? 1_000, 100), 60_000)
  while (!options.signal?.aborted) {
    const processed = await processNextSimulationRun(repositories)
    if (!processed) await waitForPoll(pollIntervalMs, options.signal)
  }
}

export function isSimulationTerminalStatus(status: SimulationStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled'
}
