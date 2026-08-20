import type { Collection, Db, IndexDescription } from 'mongodb'
import type {
  AuditEventDocument,
  CounterDocument,
  LedgerEventDocument,
  MembershipDocument,
  OrganisationDocument,
  OrganisationInvitationDocument,
  SimulationIntervalDocument,
  SimulationRunDocument,
  SimulationUsageDocument,
  SimulationSummaryDocument,
  WorkerHeartbeatDocument,
} from './models.js'

export const collectionNames = {
  organisations: 'organisations',
  memberships: 'memberships',
  organisationInvitations: 'organisation_invitations',
  simulationRuns: 'simulation_runs',
  simulationUsage: 'simulation_usage',
  simulationIntervals: 'simulation_intervals',
  simulationSummaries: 'simulation_summaries',
  ledgerEvents: 'ledger_events',
  counters: 'counters',
  auditEvents: 'audit_events',
  workerHeartbeats: 'worker_heartbeats',
} as const

export interface VoltCollections {
  organisations: Collection<OrganisationDocument>
  memberships: Collection<MembershipDocument>
  organisationInvitations: Collection<OrganisationInvitationDocument>
  simulationRuns: Collection<SimulationRunDocument>
  simulationUsage: Collection<SimulationUsageDocument>
  simulationIntervals: Collection<SimulationIntervalDocument>
  simulationSummaries: Collection<SimulationSummaryDocument>
  ledgerEvents: Collection<LedgerEventDocument>
  counters: Collection<CounterDocument>
  auditEvents: Collection<AuditEventDocument>
  workerHeartbeats: Collection<WorkerHeartbeatDocument>
}

interface CollectionSpec {
  key: keyof VoltCollections
  name: string
  indexes: IndexDescription[]
}

const collectionSpecs: CollectionSpec[] = [
  {
    key: 'organisations',
    name: collectionNames.organisations,
    indexes: [
      {
        key: { slug: 1 },
        name: 'organisations_slug_active_unique',
        unique: true,
        partialFilterExpression: { deletedAt: null },
      },
      {
        key: { createdByUserId: 1, createdAt: -1 },
        name: 'organisations_creator_created_at',
      },
    ],
  },
  {
    key: 'memberships',
    name: collectionNames.memberships,
    indexes: [
      {
        key: { organisationId: 1, userId: 1 },
        name: 'memberships_organisation_user_active_unique',
        unique: true,
        partialFilterExpression: { deletedAt: null },
      },
      {
        key: { userId: 1, organisationId: 1 },
        name: 'memberships_user_organisation',
      },
    ],
  },
  {
    key: 'organisationInvitations',
    name: collectionNames.organisationInvitations,
    indexes: [
      {
        key: { tokenHash: 1 },
        name: 'organisation_invitations_token_hash_unique',
        unique: true,
      },
      {
        key: { organisationId: 1, email: 1 },
        name: 'organisation_invitations_organisation_email_pending_unique',
        unique: true,
        partialFilterExpression: { status: 'pending', deletedAt: null },
      },
      {
        key: { organisationId: 1, status: 1, createdAt: -1 },
        name: 'organisation_invitations_organisation_status_created_at',
      },
      {
        key: { status: 1, expiresAt: 1 },
        name: 'organisation_invitations_pending_expiry',
        partialFilterExpression: { status: 'pending', deletedAt: null },
      },
    ],
  },
  {
    key: 'simulationRuns',
    name: collectionNames.simulationRuns,
    indexes: [
      {
        key: { organisationId: 1, createdAt: -1 },
        name: 'simulation_runs_organisation_created_at',
      },
      {
        key: { organisationId: 1, status: 1, createdAt: -1 },
        name: 'simulation_runs_organisation_status_created_at',
      },
    ],
  },
  {
    key: 'simulationUsage',
    name: collectionNames.simulationUsage,
    indexes: [
      {
        key: { organisationId: 1, usageDate: 1 },
        name: 'simulation_usage_organisation_date_unique',
        unique: true,
      },
    ],
  },
  {
    key: 'simulationIntervals',
    name: collectionNames.simulationIntervals,
    indexes: [
      {
        key: { runId: 1, householdId: 1, intervalStart: 1, outcome: 1 },
        name: 'simulation_intervals_run_household_start_outcome_unique',
        unique: true,
      },
      {
        key: { organisationId: 1, intervalStart: 1, householdId: 1 },
        name: 'simulation_intervals_organisation_start_household',
      },
    ],
  },
  {
    key: 'simulationSummaries',
    name: collectionNames.simulationSummaries,
    indexes: [
      {
        key: { runId: 1, householdId: 1, outcome: 1 },
        name: 'simulation_summaries_run_household_outcome_unique',
        unique: true,
      },
      {
        key: { organisationId: 1, householdId: 1, outcome: 1 },
        name: 'simulation_summaries_organisation_household_outcome',
      },
    ],
  },
  {
    key: 'ledgerEvents',
    name: collectionNames.ledgerEvents,
    indexes: [
      {
        key: { organisationId: 1, sequence: 1 },
        name: 'ledger_events_organisation_sequence_unique',
        unique: true,
      },
      {
        key: { organisationId: 1, sourceRunId: 1, householdId: 1, eventType: 1 },
        name: 'ledger_events_settlement_run_household_unique',
        unique: true,
        partialFilterExpression: { eventType: 'settlement' },
      },
      {
        key: { organisationId: 1, eventType: 1, idempotencyKey: 1 },
        name: 'ledger_events_adjustment_idempotency_unique',
        unique: true,
        partialFilterExpression: { eventType: 'adjustment', idempotencyKey: { $type: 'string' } },
      },
      {
        key: { organisationId: 1, settlementDate: 1, householdId: 1 },
        name: 'ledger_events_organisation_date_household',
      },
      {
        key: { organisationId: 1, createdAt: -1 },
        name: 'ledger_events_organisation_created_at',
      },
    ],
  },
  {
    key: 'counters',
    name: collectionNames.counters,
    indexes: [
      {
        key: { organisationId: 1, name: 1 },
        name: 'counters_organisation_name_unique',
        unique: true,
      },
    ],
  },
  {
    key: 'auditEvents',
    name: collectionNames.auditEvents,
    indexes: [
      {
        key: { organisationId: 1, createdAt: -1 },
        name: 'audit_events_organisation_created_at',
      },
      {
        key: { actorUserId: 1, createdAt: -1 },
        name: 'audit_events_actor_created_at',
      },
    ],
  },
  {
    key: 'workerHeartbeats',
    name: collectionNames.workerHeartbeats,
    indexes: [
      {
        // Reads ask which workers reported recently, never which one by name.
        key: { updatedAt: -1 },
        name: 'worker_heartbeats_updated_at',
      },
    ],
  },
]

export function getVoltCollections(db: Db): VoltCollections {
  return {
    organisations: db.collection<OrganisationDocument>(collectionNames.organisations),
    memberships: db.collection<MembershipDocument>(collectionNames.memberships),
    organisationInvitations: db.collection<OrganisationInvitationDocument>(collectionNames.organisationInvitations),
    simulationRuns: db.collection<SimulationRunDocument>(collectionNames.simulationRuns),
    simulationUsage: db.collection<SimulationUsageDocument>(collectionNames.simulationUsage),
    simulationIntervals: db.collection<SimulationIntervalDocument>(collectionNames.simulationIntervals),
    simulationSummaries: db.collection<SimulationSummaryDocument>(collectionNames.simulationSummaries),
    ledgerEvents: db.collection<LedgerEventDocument>(collectionNames.ledgerEvents),
    counters: db.collection<CounterDocument>(collectionNames.counters),
    auditEvents: db.collection<AuditEventDocument>(collectionNames.auditEvents),
    workerHeartbeats: db.collection<WorkerHeartbeatDocument>(collectionNames.workerHeartbeats),
  }
}

export async function initializeVoltDatabase(db: Db): Promise<void> {
  const existing = new Set(
    (await db.listCollections({}, { nameOnly: true }).toArray()).map(({ name }) => name),
  )

  for (const spec of collectionSpecs) {
    if (!existing.has(spec.name)) await db.createCollection(spec.name)
  }

  const collections = getVoltCollections(db)
  await Promise.all(
    collectionSpecs.map((spec) => {
      const collection = collections[spec.key]
      return collection.createIndexes(spec.indexes)
    }),
  )
}

export function getCollectionSpecs(): readonly CollectionSpec[] {
  return collectionSpecs
}
