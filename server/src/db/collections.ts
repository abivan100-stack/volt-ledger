import type { Collection, Db, IndexDescription } from 'mongodb'
import type {
  AuditEventDocument,
  CounterDocument,
  DemoDayDocument,
  DemoHouseholdDayDocument,
  DemoRunDocument,
  DemoSessionDocument,
  DemoTradeDocument,
  EmailDeliveryDocument,
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
  emailDeliveries: 'email_deliveries',
  demoSessions: 'demo_sessions',
  demoRuns: 'demo_runs',
  demoTrades: 'demo_trades',
  demoDays: 'demo_days',
  demoHouseholdDays: 'demo_household_days',
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
  emailDeliveries: Collection<EmailDeliveryDocument>
  demoSessions: Collection<DemoSessionDocument>
  demoRuns: Collection<DemoRunDocument>
  demoTrades: Collection<DemoTradeDocument>
  demoDays: Collection<DemoDayDocument>
  demoHouseholdDays: Collection<DemoHouseholdDayDocument>
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
      {
        // The worker claims across every organisation at once; without this the
        // claim query scans the whole collection. The leading `deletedAt` allows
        // the partial filter to be covered and `status` bounds both claim branches.
        key: { deletedAt: 1, status: 1, startedAt: 1, createdAt: 1 },
        name: 'simulation_runs_claim_queue',
        partialFilterExpression: { deletedAt: null },
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
        key: { organisationId: 1, action: 1, createdAt: -1, _id: -1 },
        name: 'audit_events_organisation_action_created_at',
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
  {
    key: 'emailDeliveries',
    name: collectionNames.emailDeliveries,
    indexes: [
      {
        key: { idempotencyKey: 1 },
        name: 'email_deliveries_idempotency_unique',
        unique: true,
      },
      {
        key: { status: 1, nextAttemptAt: 1, createdAt: 1 },
        name: 'email_deliveries_claim_queue',
      },
    ],
  },
  // The demo collections below hold anonymous public-demo traffic. Every one of
  // them carries a TTL on \`expiresAt\` (\`expireAfterSeconds: 0\` deletes a document
  // once that instant passes) because demo data is disposable by design and this
  // database is shared — it must not grow without bound.
  {
    key: 'demoSessions',
    name: collectionNames.demoSessions,
    indexes: [
      { key: { expiresAt: 1 }, name: 'demo_sessions_ttl', expireAfterSeconds: 0 },
    ],
  },
  {
    key: 'demoRuns',
    name: collectionNames.demoRuns,
    indexes: [
      {
        key: { sessionId: 1, startedAt: -1 },
        name: 'demo_runs_session_started_at',
      },
      { key: { expiresAt: 1 }, name: 'demo_runs_ttl', expireAfterSeconds: 0 },
    ],
  },
  {
    key: 'demoTrades',
    name: collectionNames.demoTrades,
    indexes: [
      {
        // Trades are insert-only and a flush may be retried, so the same block
        // can arrive twice. Uniqueness is what makes the retry a no-op instead
        // of a duplicate row.
        key: { runId: 1, simDay: 1, blockId: 1 },
        name: 'demo_trades_run_day_block_unique',
        unique: true,
      },
      {
        // Serves the export query, which walks a session's trades newest-first
        // to decide which simulated days fall inside the chosen timeframe.
        key: { sessionId: 1, recordedAt: -1 },
        name: 'demo_trades_session_recorded_at',
      },
      { key: { expiresAt: 1 }, name: 'demo_trades_ttl', expireAfterSeconds: 0 },
    ],
  },
  {
    key: 'demoDays',
    name: collectionNames.demoDays,
    indexes: [
      {
        key: { runId: 1, simDay: 1 },
        name: 'demo_days_run_day_unique',
        unique: true,
      },
      {
        key: { sessionId: 1, closedAt: -1 },
        name: 'demo_days_session_closed_at',
      },
      { key: { expiresAt: 1 }, name: 'demo_days_ttl', expireAfterSeconds: 0 },
    ],
  },
  {
    key: 'demoHouseholdDays',
    name: collectionNames.demoHouseholdDays,
    indexes: [
      {
        key: { runId: 1, simDay: 1, householdId: 1 },
        name: 'demo_household_days_run_day_household_unique',
        unique: true,
      },
      {
        key: { sessionId: 1, recordedAt: -1 },
        name: 'demo_household_days_session_recorded_at',
      },
      { key: { expiresAt: 1 }, name: 'demo_household_days_ttl', expireAfterSeconds: 0 },
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
    emailDeliveries: db.collection<EmailDeliveryDocument>(collectionNames.emailDeliveries),
    demoSessions: db.collection<DemoSessionDocument>(collectionNames.demoSessions),
    demoRuns: db.collection<DemoRunDocument>(collectionNames.demoRuns),
    demoTrades: db.collection<DemoTradeDocument>(collectionNames.demoTrades),
    demoDays: db.collection<DemoDayDocument>(collectionNames.demoDays),
    demoHouseholdDays: db.collection<DemoHouseholdDayDocument>(collectionNames.demoHouseholdDays),
  }
}

/**
 * The two ways a requested index can clash with one already there.
 *
 * They are not the same clash, and the difference decides what has to be
 * dropped:
 *
 * - `IndexKeySpecsConflict` (86) — an index of that *name* exists with a
 *   different key. The name is the thing in the way.
 * - `IndexOptionsConflict` (85) — an index of that *key* exists with different
 *   options, quite possibly under a different name. The name being asked for
 *   may not exist at all.
 *
 * So neither case may assume the offending index is called what the code wants
 * to call it; both look it up.
 */
const INDEX_CONFLICT_CODES = new Set([85, 86])

function isIndexConflict(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'number' &&
    INDEX_CONFLICT_CODES.has(error.code)
  )
}

/** Whether two index key patterns are the same fields, in the same order. */
function sameKeyPattern(left: unknown, right: unknown): boolean {
  if (typeof left !== 'object' || left === null) return false
  if (typeof right !== 'object' || right === null) return false

  const a = Object.entries(left as Record<string, unknown>)
  const b = Object.entries(right as Record<string, unknown>)
  if (a.length !== b.length) return false

  // Field order is part of an index's identity, so this compares positionally.
  return a.every(([field, direction], position) => {
    const [otherField, otherDirection] = b[position] ?? []
    return field === otherField && String(direction) === String(otherDirection)
  })
}

/** `IndexNotFound` — the index is already gone, which is where we were headed. */
function isIndexNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && 'code' in error && error.code === 27
  )
}

function describeCause(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Drops whichever existing index is standing in the way, then builds the wanted
 * one in its place.
 *
 * The index to drop is found by asking the collection what it actually has,
 * rather than assuming it goes by the name being requested — under an options
 * conflict it need not. If nothing there explains the clash, the original error
 * is raised untouched: an unexplained conflict is not something to start
 * dropping indexes over.
 *
 * Dropping and rebuilding is the only way MongoDB offers to redefine an index:
 * it will not hold two indexes over one key, nor two under one name, so the new
 * definition cannot be built alongside the old one first. There is therefore a
 * window in which neither exists. It is not silent — if the rebuild fails, the
 * error says which index was dropped and on what collection, so the state the
 * database is actually in is the state that gets reported.
 */
async function rebuildConflictingIndex(
  collection: Collection<never>,
  index: IndexDescription,
  cause: unknown,
): Promise<void> {
  const existing = await collection.listIndexes().toArray()
  const clashing =
    existing.find((candidate) => index.name !== undefined && candidate.name === index.name) ??
    existing.find((candidate) => sameKeyPattern(candidate.key, index.key))

  // `_id_` cannot be dropped and is never one of ours to redefine.
  if (clashing?.name === undefined || clashing.name === '_id_') throw cause

  try {
    await collection.dropIndex(clashing.name)
  } catch (error) {
    // The API and the worker start together and both run this. Losing the race
    // to drop an index is not a failure: the other process wanted it gone too,
    // and the rebuild below is a no-op once it has put the new one back.
    if (!isIndexNotFound(error)) throw error
  }

  try {
    await collection.createIndexes([index])
  } catch (error) {
    throw new Error(
      `Index "${clashing.name}" on ${collection.collectionName} was dropped so it could be ` +
        `redefined, and rebuilding it failed. The collection no longer has that index. ` +
        `Rebuild it before relying on the queries or constraints it served. ` +
        `Cause: ${describeCause(error)}`,
      { cause: error },
    )
  }
}

/**
 * Brings a collection's indexes up to the definitions in this file.
 *
 * Creating them is almost always a no-op, so that is tried in one round trip
 * first. The exception is an index whose definition has changed since it was
 * built — a new key, or a partial filter that was not there before. MongoDB
 * refuses that outright, and because the whole batch fails together, one such
 * index would otherwise stop the process from starting at all: not on a fresh
 * database, where nothing conflicts, but on every database that already has the
 * older index, which is to say every real one.
 *
 * So a conflict is reconciled rather than raised. Anything else — a bad key, a
 * failed build — still throws.
 */
async function ensureIndexes(
  collection: Collection<never>,
  indexes: IndexDescription[],
): Promise<void> {
  if (indexes.length === 0) return

  try {
    await collection.createIndexes(indexes)
    return
  } catch (error) {
    if (!isIndexConflict(error)) throw error
  }

  // One of them conflicts, and the batch does not say which. Retried one at a
  // time so the others are still created and the culprit can be dealt with.
  for (const index of indexes) {
    try {
      await collection.createIndexes([index])
    } catch (error) {
      if (!isIndexConflict(error)) throw error
      await rebuildConflictingIndex(collection, index, error)
    }
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
    collectionSpecs.map((spec) =>
      ensureIndexes(collections[spec.key] as unknown as Collection<never>, spec.indexes),
    ),
  )
}

export function getCollectionSpecs(): readonly CollectionSpec[] {
  return collectionSpecs
}
