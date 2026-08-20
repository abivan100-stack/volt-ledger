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
