export const membershipRoles = ['owner', 'admin', 'operator', 'viewer'] as const
export type MembershipRole = (typeof membershipRoles)[number]

export const simulationStatuses = ['queued', 'running', 'completed', 'failed', 'cancelled'] as const
export type SimulationStatus = (typeof simulationStatuses)[number]

export const simulationOutcomes = ['p10', 'p50', 'p90', 'selected'] as const
export type SimulationOutcome = (typeof simulationOutcomes)[number]

export const ledgerEventTypes = ['settlement', 'adjustment'] as const
export type LedgerEventType = (typeof ledgerEventTypes)[number]

export const invitationStatuses = ['pending', 'accepted', 'revoked'] as const
export type InvitationStatus = (typeof invitationStatuses)[number]

export type InvitationRole = Exclude<MembershipRole, 'owner'>

export const workerHealthStatuses = ['starting', 'healthy', 'degraded', 'stopped'] as const
export type WorkerHealthStatus = (typeof workerHealthStatuses)[number]

export const emailDeliveryStatuses = ['pending', 'processing', 'sent', 'failed', 'cancelled'] as const
export type EmailDeliveryStatus = (typeof emailDeliveryStatuses)[number]

export interface EmailDeliveryDocument {
  _id: string
  /** Present on new rows; older rows can still be recovered from the key. */
  invitationId?: string
  idempotencyKey: string
  kind: 'organisation_invitation'
  to: string
  organisationName: string
  role: InvitationRole
  encryptedUrl: string
  status: EmailDeliveryStatus
  attemptCount: number
  nextAttemptAt: Date
  lockedUntil: Date | null
  lastErrorCode: string | null
  createdAt: Date
  updatedAt: Date
  sentAt: Date | null
}

export type JsonObject = Record<string, unknown>

export interface OrganisationDocument {
  _id: string
  name: string
  slug: string
  createdByUserId: string
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
}

export interface MembershipDocument {
  _id: string
  organisationId: string
  userId: string
  email: string | null
  role: MembershipRole
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
}

export interface OrganisationInvitationDocument {
  _id: string
  organisationId: string
  email: string
  role: InvitationRole
  tokenHash: string
  status: InvitationStatus
  invitedByUserId: string
  expiresAt: Date
  acceptedByUserId: string | null
  acceptedAt: Date | null
  revokedAt: Date | null
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
}

export interface SimulationRunDocument {
  _id: string
  organisationId: string
  requestedByUserId: string
  seed: string
  modelVersion: string
  inputSnapshot: JsonObject
  inputDigest: string
  status: SimulationStatus
  /** Incremented on every claim, including a stale-lease reclaim. */
  attemptCount: number
  createdAt: Date
  startedAt: Date | null
  completedAt: Date | null
  resultDigest: string | null
  errorCode: string | null
  deletedAt: Date | null
}

export interface SimulationUsageDocument {
  _id: string
  organisationId: string
  usageDate: string
  runCount: number
  createdAt: Date
  updatedAt: Date
}

export interface SimulationIntervalDocument {
  _id: string
  organisationId: string
  runId: string
  householdId: string
  intervalStart: Date
  intervalEnd: Date
  generatedKwh: number
  consumedKwh: number
  importedKwh: number
  exportedKwh: number
  estimatedCreditInr: number
  outcome: SimulationOutcome
  createdAt: Date
  deletedAt: Date | null
}

export interface SimulationSummaryDocument {
  _id: string
  organisationId: string
  runId: string
  householdId: string
  outcome: SimulationOutcome
  intervalCount: number
  generatedKwh: number
  consumedKwh: number
  importedKwh: number
  exportedKwh: number
  estimatedCreditInr: number
  createdAt: Date
  deletedAt: Date | null
}

export interface LedgerEventDocument {
  _id: string
  organisationId: string
  sequence: number
  eventType: LedgerEventType
  outcome: SimulationOutcome
  actorUserId: string
  householdId: string
  settlementDate: string
  sourceRunId: string
  simulationResultDigest: string
  energyKwh: number
  estimatedCreditInr: number
  previousSeal: string | null
  canonicalSeal: string
  adjustmentTargetEventId: string | null
  adjustmentReason: string | null
  idempotencyKey: string | null
  createdAt: Date
}

export interface CounterDocument {
  _id: string
  organisationId: string
  name: 'ledger'
  nextSequence: number
  createdAt: Date
  updatedAt: Date
}

export interface AuditEventDocument {
  _id: string
  organisationId: string
  actorUserId: string
  action: string
  entityType: string
  entityId: string
  metadata: JsonObject
  createdAt: Date
}

/**
 * One row per worker process, rewritten in place as it runs.
 *
 * Holds no free-form error text: the document is read by other services and a
 * driver message can quote a connection string, so only a code is kept.
 */
export interface WorkerHeartbeatDocument {
  /** The worker's identity, stable across restarts of the same deployment. */
  _id: string
  status: WorkerHealthStatus
  startedAt: Date
  updatedAt: Date
  lastSuccessAt: Date | null
  consecutiveFailures: number
  processedCount: number
  lastErrorCode: string | null
}

// ----------------------------------------------------------- demo persistence

/**
 * Storage for the public browser demo — the live ticking neighbourhood on the
 * landing page, not the authenticated Monte Carlo runs above.
 *
 * These documents are deliberately kept in their own collections rather than
 * folded into `simulation_*` and `ledger_events`. Two reasons: the demo has no
 * organisation and no signed-in actor, so it cannot satisfy the tenancy those
 * collections are keyed by; and `ledger_events` is a tamper-evident settlement
 * record whose value depends on every row having been written by an authorised
 * member. Anonymous demo traffic belongs beside it, never inside it.
 *
 * Ownership is a `sessionId` the browser generates and keeps in `localStorage`,
 * so a visitor sees their own history across reloads and nobody else's. Every
 * document carries `expiresAt` for a TTL index; demo data is disposable by
 * design and must not accumulate.
 */

/** Kept in step with `SIMULATION_DAY_TYPES` by `demoDayTypes.test.ts`. */
export const demoDayTypes = ['sunny-weekday', 'cloudy', 'weekend', 'heatwave'] as const
export type DemoDayType = (typeof demoDayTypes)[number]

export interface DemoSessionDocument {
  /** Client-generated UUID, held in the browser's `localStorage`. */
  _id: string
  createdAt: Date
  lastSeenAt: Date
  runCount: number
  dayCount: number
  tradeCount: number
  expiresAt: Date
}

/** One scenario. A new run starts whenever the visitor resets the simulation. */
export interface DemoRunDocument {
  _id: string
  sessionId: string
  dayType: DemoDayType
  startHour: number
  simSpeed: number
  startedAt: Date
  lastSeenAt: Date
  expiresAt: Date
}

/**
 * One settled trade, written once and never updated.
 *
 * `serverSeal` is recomputed by the API from the payload; `clientSeal` is what
 * the browser claimed. `sealMatchesClient` records whether they agreed, which is
 * what makes the stored chain evidence rather than hearsay.
 */
export interface DemoTradeDocument {
  _id: string
  sessionId: string
  runId: string
  simDay: number
  /** Position within (runId, simDay); the browser's chain restarts each day. */
  blockId: number
  clock: string
  fromName: string
  toName: string
  kwh: number
  credit: number
  rate: number
  clientSeal: string
  clientPreviousSeal: string
  serverSeal: string
  serverPreviousSeal: string
  sealMatchesClient: boolean
  recordedAt: Date
  expiresAt: Date
}

/**
 * Per-sim-day rollup, written when the simulated day rolls over.
 *
 * Holds only what cannot be worked out from the trades themselves. A day's
 * energy and credit totals are deliberately *not* among them: they are summed
 * from `demo_trades` whenever the ledger is read, so there is no second copy
 * that could disagree with the first. Storing derived figures would mean
 * defending them against every ordering in which a late trade and a day close
 * can interleave — a defence that has to be perfect to be worth anything.
 *
 * What is stored is either an immutable input (the day type, the closing rate)
 * or a record of something observed once, at close, and never recomputed.
 */
export interface DemoDayDocument {
  _id: string
  sessionId: string
  runId: string
  simDay: number
  dayType: DemoDayType
  /**
   * The figures the browser reported, and whether they matched the trades the
   * server held at the moment the day was closed. A record of an observation,
   * not a running total: it is never revised, and exports never read it as one.
   */
  clientTotalKwh: number
  clientTotalCredit: number
  clientTradeCount: number
  totalsMatchedClientAtClose: boolean
  /**
   * Client-reported, and unverifiable by design. The community rate and the
   * tamper flags describe what happened in the visitor's own copy of the chain
   * after the trades were stored, so the server has no independent view of them.
   * The stored trades remain intact either way.
   */
  closingRate: number
  compromised: boolean
  invalidCount: number
  closedAt: Date
  expiresAt: Date
}

/**
 * Per-household daily energy totals.
 *
 * Only the accumulated figures are stored. Instantaneous per-tick output is a
 * pure function of (dayType, hour, householdId) and can be recomputed exactly,
 * so persisting it would be redundant volume for no recoverable information.
 */
export interface DemoHouseholdDayDocument {
  _id: string
  sessionId: string
  runId: string
  simDay: number
  householdId: number
  householdName: string
  generatedKwh: number
  consumedKwh: number
  exportedKwh: number
  importedKwh: number
  earnedInr: number
  spentInr: number
  tradeCount: number
  balanceInr: number
  recordedAt: Date
  expiresAt: Date
}
