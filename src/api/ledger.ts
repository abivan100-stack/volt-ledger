import { send, type ResourceOptions } from './resource'
import type { SimulationOutcome } from './simulations'

/**
 * Server-owned append-only settlement ledger.
 *
 * Events are immutable and hash-linked: each carries the previous event's seal,
 * so any edit to history breaks verification from that point on. Nothing in this
 * module can modify or delete an event. A correction is a new adjustment event
 * carrying a signed delta against a target, never an edit of the target.
 *
 * Settlement energy is the accepted outcome's synthetic `exportedKwh` — an
 * estimate, not a meter reading or a payment.
 */

export type LedgerEventType = 'settlement' | 'adjustment'

export interface LedgerEvent {
  id: string
  /** Monotonic within the organisation, starting at 1. */
  sequence: number
  eventType: LedgerEventType
  outcome: SimulationOutcome | null
  actorUserId: string
  householdId: string
  /** `YYYY-MM-DD`. */
  settlementDate: string
  sourceRunId: string
  simulationResultDigest: string
  energyKwh: number
  estimatedCreditInr: number
  /** `null` only for the first event in the chain. */
  previousSeal: string | null
  canonicalSeal: string
  adjustmentTargetEventId: string | null
  adjustmentReason: string | null
  idempotencyKey: string | null
  createdAt: string
}

/** The server's own verification of the returned slice of the chain. */
export interface LedgerIntegrity {
  /** Every seal recomputed and every link matched. */
  valid: boolean
  /** The slice starts at sequence 1 rather than partway through the chain. */
  complete: boolean
  checkedEvents: number
  firstSequence: number | null
  lastSequence: number | null
}

export interface LedgerPage {
  events: LedgerEvent[]
  integrity: LedgerIntegrity
}

export interface Settlement {
  runId: string
  resultDigest: string | null
  outcome: SimulationOutcome
  /** True when this exact settlement had already been recorded. */
  alreadySettled: boolean
  events: LedgerEvent[]
}

export interface CreateAdjustmentInput {
  targetEventId: string
  /** Replaying the same key with the same values is a no-op; different values conflict. */
  idempotencyKey: string
  /** Signed delta. Energy and credit may not both be zero. */
  energyKwh: number
  estimatedCreditInr: number
  reason: string
}

export interface AppliedAdjustment {
  alreadyApplied: boolean
  event: LedgerEvent
}

interface SettlementResponse {
  settlement: Settlement
}

interface AdjustmentResponse {
  adjustment: AppliedAdjustment
}

/** Ledger history for the organisation. Readable by any member. */
export async function listLedgerEvents(
  organisationId: string,
  options: ResourceOptions & { limit?: number } = {},
): Promise<LedgerPage> {
  const { limit, ...resourceOptions } = options
  return send<LedgerPage>(
    resourceOptions,
    `/api/v1/organisations/${organisationId}/ledger`,
    limit === undefined ? {} : { query: { limit } },
  )
}

/**
 * Accepts one completed run's outcome, appending one immutable event per
 * household. Owner/admin only, and idempotent: repeating the same acceptance
 * returns the existing events with `alreadySettled`, while accepting a
 * *different* outcome for an already-settled run is refused.
 */
export async function settleSimulationRun(
  organisationId: string,
  runId: string,
  outcome: SimulationOutcome,
  options: ResourceOptions = {},
): Promise<Settlement> {
  const response = await send<SettlementResponse>(
    options,
    `/api/v1/organisations/${organisationId}/simulations/${encodeURIComponent(runId)}/settlement`,
    { method: 'POST', body: { outcome } },
  )
  return response.settlement
}

/**
 * Appends a signed correction against an accepted settlement event. Owner/admin
 * only. The target event is never modified.
 */
export async function createLedgerAdjustment(
  organisationId: string,
  input: CreateAdjustmentInput,
  options: ResourceOptions = {},
): Promise<AppliedAdjustment> {
  const response = await send<AdjustmentResponse>(
    options,
    `/api/v1/organisations/${organisationId}/ledger/adjustments`,
    { method: 'POST', body: input },
  )
  return response.adjustment
}
