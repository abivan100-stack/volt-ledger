import { send, type ResourceOptions } from './resource'

/**
 * Synthetic Monte Carlo simulation resource.
 *
 * A run is queued, not computed in the request: a separate worker claims it,
 * so `createSimulationRun` answers `202` with a queued run and the caller polls
 * for its status. Results exist only once the run is `completed`.
 *
 * Every run is replayable from its seed, model version, and input digest. The
 * data is synthetic throughout — never a meter reading.
 */

/** Mirrors `SIMULATION_DAY_TYPES` on the API; the server rejects anything else. */
export const SIMULATION_DAY_TYPES = ['sunny-weekday', 'cloudy', 'weekend', 'heatwave'] as const

export type SimulationDayType = (typeof SIMULATION_DAY_TYPES)[number]

export const SIMULATION_STATUSES = ['queued', 'running', 'completed', 'failed', 'cancelled'] as const

export type SimulationStatus = (typeof SIMULATION_STATUSES)[number]

export const SIMULATION_OUTCOMES = ['p10', 'p50', 'p90', 'selected'] as const

export type SimulationOutcome = (typeof SIMULATION_OUTCOMES)[number]

export interface SimulationHouseholdInput {
  id: string
  pvKw: number
  baseLoadKw: number
}

export interface CreateSimulationInput {
  /** Any stable string; the same seed and inputs replay byte-identically. */
  seed: string
  /** `YYYY-MM-DD`. */
  simulationDate: string
  dayType: SimulationDayType
  households: SimulationHouseholdInput[]
  sampleCount?: number
  intervalMinutes?: 10 | 30 | 60
  rateInrPerKwh?: number
}

export interface SimulationRun {
  id: string
  organisationId: string
  requestedByUserId: string
  seed: string
  modelVersion: string
  status: SimulationStatus
  inputDigest: string
  resultDigest: string | null
  errorCode: string | null
  createdAt: string
  startedAt: string | null
  completedAt: string | null
}

export interface SimulationQuota {
  /** UTC calendar day the usage applies to, `YYYY-MM-DD`. */
  usageDate: string
  used: number
  limit: number
  remaining: number
  /** ISO-8601 of the next UTC midnight. */
  resetsAt: string
}

export interface SimulationInterval {
  id: string
  householdId: string
  intervalStart: string
  intervalEnd: string
  generatedKwh: number
  consumedKwh: number
  importedKwh: number
  exportedKwh: number
  estimatedCreditInr: number
  outcome: SimulationOutcome
  createdAt: string
}

export interface SimulationSummary {
  id: string
  householdId: string
  outcome: SimulationOutcome
  intervalCount: number
  generatedKwh: number
  consumedKwh: number
  importedKwh: number
  exportedKwh: number
  estimatedCreditInr: number
  createdAt: string
}

export interface SimulationResults {
  run: SimulationRun
  intervals: SimulationInterval[]
  summaries: SimulationSummary[]
}

interface RunResponse {
  run: SimulationRun
}

interface RunListResponse {
  runs: SimulationRun[]
}

interface QuotaResponse {
  quota: SimulationQuota
}

/**
 * Queues a run. Answers `202` — the run is `queued`, not finished. Exhausting the
 * organisation's daily quota rejects with `429` and a `Retry-After`.
 */
export async function createSimulationRun(
  organisationId: string,
  input: CreateSimulationInput,
  options: ResourceOptions = {},
): Promise<SimulationRun> {
  const response = await send<RunResponse>(
    options,
    `/api/v1/organisations/${organisationId}/simulations`,
    { method: 'POST', body: input },
  )
  return response.run
}

export async function listSimulationRuns(
  organisationId: string,
  options: ResourceOptions & { limit?: number } = {},
): Promise<SimulationRun[]> {
  const { limit, ...resourceOptions } = options
  const response = await send<RunListResponse>(
    resourceOptions,
    `/api/v1/organisations/${organisationId}/simulations`,
    limit === undefined ? {} : { query: { limit } },
  )
  return response.runs
}

export async function getSimulationRun(
  organisationId: string,
  runId: string,
  options: ResourceOptions = {},
): Promise<SimulationRun> {
  const response = await send<RunResponse>(
    options,
    `/api/v1/organisations/${organisationId}/simulations/${encodeURIComponent(runId)}`,
  )
  return response.run
}

/** Rejects with `409 SIMULATION_NOT_COMPLETE` until the worker has finished the run. */
export async function getSimulationResults(
  organisationId: string,
  runId: string,
  options: ResourceOptions & { limit?: number } = {},
): Promise<SimulationResults> {
  const { limit, ...resourceOptions } = options
  return send<SimulationResults>(
    resourceOptions,
    `/api/v1/organisations/${organisationId}/simulations/${encodeURIComponent(runId)}/results`,
    limit === undefined ? {} : { query: { limit } },
  )
}

/** The organisation's UTC daily run allowance. Readable by any member. */
export async function getSimulationQuota(
  organisationId: string,
  options: ResourceOptions = {},
): Promise<SimulationQuota> {
  const response = await send<QuotaResponse>(
    options,
    `/api/v1/organisations/${organisationId}/simulations/quota`,
  )
  return response.quota
}
