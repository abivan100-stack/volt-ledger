import { createHash, randomUUID } from 'node:crypto'
import type { ClientSession, Db, MongoClient } from 'mongodb'
import { getMongoClient } from './mongo.js'
import { getVoltCollections, type VoltCollections } from './collections.js'
import {
  membershipRoles,
  type AuditEventDocument,
  type JsonObject,
  type LedgerEventDocument,
  type LedgerEventType,
  type MembershipDocument,
  type MembershipRole,
  type OrganisationDocument,
  type SimulationIntervalDocument,
  type SimulationOutcome,
  type SimulationRunDocument,
  type SimulationStatus,
  type SimulationSummaryDocument,
} from './models.js'

const simulationTransitions: Record<SimulationStatus, readonly SimulationStatus[]> = {
  queued: ['running', 'cancelled'],
  running: ['completed', 'failed', 'cancelled'],
  completed: [],
  failed: [],
  cancelled: [],
}

export interface CreateOrganisationInput {
  name: string
  slug: string
  createdByUserId: string
}

export interface CreateOrganisationWithOwnerResult {
  organisation: OrganisationDocument
  membership: MembershipDocument
}

export interface CreateMembershipInput {
  organisationId: string
  userId: string
  role: MembershipRole
}

export interface CreateSimulationRunInput {
  organisationId: string
  requestedByUserId: string
  seed: string
  modelVersion: string
  inputSnapshot: JsonObject
  inputDigest: string
}

export interface CreateSimulationIntervalInput {
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
}

export interface CreateSimulationSummaryInput {
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
}

export interface AppendLedgerEventInput {
  organisationId: string
  eventType: LedgerEventType
  householdId: string
  settlementDate: string
  sourceRunId: string
  simulationResultDigest: string
  energyKwh: number
  estimatedCreditInr: number
}

export interface CreateAuditEventInput {
  organisationId: string
  actorUserId: string
  action: string
  entityType: string
  entityId: string
  metadata?: JsonObject
}

export interface OrganisationRepository {
  create(input: CreateOrganisationInput): Promise<OrganisationDocument>
  createWithOwner(input: CreateOrganisationInput): Promise<CreateOrganisationWithOwnerResult>
  findById(id: string): Promise<OrganisationDocument | null>
  listForUser(userId: string): Promise<OrganisationDocument[]>
  softDelete(id: string): Promise<boolean>
}

export interface MembershipRepository {
  create(input: CreateMembershipInput): Promise<MembershipDocument>
  find(organisationId: string, userId: string): Promise<MembershipDocument | null>
  listForOrganisation(organisationId: string): Promise<MembershipDocument[]>
  softDelete(organisationId: string, userId: string): Promise<boolean>
}

export interface SimulationRepository {
  createRun(input: CreateSimulationRunInput): Promise<SimulationRunDocument>
  findRunById(id: string): Promise<SimulationRunDocument | null>
  transitionRun(id: string, status: SimulationStatus, details?: { resultDigest?: string; errorCode?: string }): Promise<SimulationRunDocument>
  insertIntervals(input: CreateSimulationIntervalInput[]): Promise<void>
  listIntervals(runId: string, limit?: number): Promise<SimulationIntervalDocument[]>
  insertSummaries(input: CreateSimulationSummaryInput[]): Promise<void>
  listSummaries(runId: string): Promise<SimulationSummaryDocument[]>
  softDeleteRun(id: string): Promise<boolean>
}

export interface LedgerRepository {
  append(input: AppendLedgerEventInput): Promise<LedgerEventDocument>
  list(organisationId: string, limit?: number): Promise<LedgerEventDocument[]>
}

export interface AuditRepository {
  append(input: CreateAuditEventInput): Promise<AuditEventDocument>
}

export interface VoltRepositories {
  organisations: OrganisationRepository
  memberships: MembershipRepository
  simulations: SimulationRepository
  ledger: LedgerRepository
  audit: AuditRepository
}

function normaliseSlug(value: string): string {
  const slug = value.trim().toLowerCase()
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error('Organisation slug must contain only lowercase letters, numbers, and hyphens')
  }
  return slug
}

function normaliseOrganisationName(value: string): string {
  const name = value.trim()
  if (name.length === 0) throw new Error('Organisation name is required')
  return name
}

function assertMembershipRole(role: MembershipRole): void {
  if (!membershipRoles.includes(role)) throw new Error(`Unsupported membership role: ${role}`)
}

function stableSerialize(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString())
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`)
    return `{${entries.join(',')}}`
  }
  return JSON.stringify(value)
}

export function createLedgerSeal(payload: Omit<LedgerEventDocument, '_id' | 'canonicalSeal' | 'createdAt'>): string {
  return createHash('sha256').update(stableSerialize(payload)).digest('hex')
}

function buildOrganisationDocument(input: CreateOrganisationInput, now: Date): OrganisationDocument {
  return {
    _id: randomUUID(),
    name: normaliseOrganisationName(input.name),
    slug: normaliseSlug(input.slug),
    createdByUserId: input.createdByUserId,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }
}

function buildMembershipDocument(input: CreateMembershipInput, now: Date): MembershipDocument {
  assertMembershipRole(input.role)
  return {
    _id: randomUUID(),
    organisationId: input.organisationId,
    userId: input.userId,
    role: input.role,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }
}

function createOrganisationRepository(collections: VoltCollections, client: MongoClient): OrganisationRepository {
  return {
    async create(input) {
      const now = new Date()
      const document = buildOrganisationDocument(input, now)
      await collections.organisations.insertOne(document)
      return document
    },
    async createWithOwner(input) {
      const session = client.startSession()
      try {
        let result: CreateOrganisationWithOwnerResult | undefined
        await session.withTransaction(async () => {
          const now = new Date()
          const organisation = buildOrganisationDocument(input, now)
          const membership = buildMembershipDocument(
            {
              organisationId: organisation._id,
              userId: input.createdByUserId,
              role: 'owner',
            },
            now,
          )
          const auditEvent: AuditEventDocument = {
            _id: randomUUID(),
            organisationId: organisation._id,
            actorUserId: input.createdByUserId,
            action: 'organisation.created',
            entityType: 'organisation',
            entityId: organisation._id,
            metadata: { slug: organisation.slug },
            createdAt: now,
          }

          await collections.organisations.insertOne(organisation, { session })
          await collections.memberships.insertOne(membership, { session })
          await collections.auditEvents.insertOne(auditEvent, { session })
          result = { organisation, membership }
        })
        if (!result) throw new Error('Organisation could not be created')
        return result
      } finally {
        await session.endSession()
      }
    },
    findById(id) {
      return collections.organisations.findOne({ _id: id, deletedAt: null })
    },
    async listForUser(userId) {
      const memberships = await collections.memberships
        .find({ userId, deletedAt: null }, { projection: { organisationId: 1 } })
        .toArray()
      const ids = memberships.map(({ organisationId }) => organisationId)
      if (ids.length === 0) return []
      return collections.organisations.find({ _id: { $in: ids }, deletedAt: null }).sort({ createdAt: -1 }).toArray()
    },
    async softDelete(id) {
      const result = await collections.organisations.updateOne(
        { _id: id, deletedAt: null },
        { $set: { deletedAt: new Date(), updatedAt: new Date() } },
      )
      return result.modifiedCount === 1
    },
  }
}

function createMembershipRepository(collections: VoltCollections): MembershipRepository {
  return {
    async create(input) {
      const now = new Date()
      const document = buildMembershipDocument(input, now)
      await collections.memberships.insertOne(document)
      return document
    },
    find(organisationId, userId) {
      return collections.memberships.findOne({ organisationId, userId, deletedAt: null })
    },
    listForOrganisation(organisationId) {
      return collections.memberships.find({ organisationId, deletedAt: null }).sort({ createdAt: 1 }).toArray()
    },
    async softDelete(organisationId, userId) {
      const result = await collections.memberships.updateOne(
        { organisationId, userId, deletedAt: null },
        { $set: { deletedAt: new Date(), updatedAt: new Date() } },
      )
      return result.modifiedCount === 1
    },
  }
}

function createSimulationRepository(collections: VoltCollections): SimulationRepository {
  return {
    async createRun(input) {
      const document: SimulationRunDocument = {
        _id: randomUUID(),
        organisationId: input.organisationId,
        requestedByUserId: input.requestedByUserId,
        seed: input.seed,
        modelVersion: input.modelVersion,
        inputSnapshot: input.inputSnapshot,
        inputDigest: input.inputDigest,
        status: 'queued',
        createdAt: new Date(),
        startedAt: null,
        completedAt: null,
        resultDigest: null,
        errorCode: null,
        deletedAt: null,
      }
      await collections.simulationRuns.insertOne(document)
      return document
    },
    findRunById(id) {
      return collections.simulationRuns.findOne({ _id: id, deletedAt: null })
    },
    async transitionRun(id, status, details = {}) {
      const current = await collections.simulationRuns.findOne({ _id: id, deletedAt: null })
      if (!current) throw new Error('Simulation run not found')
      if (!simulationTransitions[current.status].includes(status)) {
        throw new Error(`Invalid simulation transition: ${current.status} -> ${status}`)
      }

      const now = new Date()
      const update: Partial<SimulationRunDocument> = {
        status,
        resultDigest: details.resultDigest ?? current.resultDigest,
        errorCode: details.errorCode ?? current.errorCode,
      }
      if (status === 'running') update.startedAt = now
      if (status === 'completed' || status === 'failed' || status === 'cancelled') update.completedAt = now

      const result = await collections.simulationRuns.updateOne(
        { _id: id, status: current.status, deletedAt: null },
        { $set: update },
      )
      if (result.modifiedCount !== 1) throw new Error('Simulation run changed before transition could be saved')
      const next = await collections.simulationRuns.findOne({ _id: id, deletedAt: null })
      if (!next) throw new Error('Simulation run disappeared after transition')
      return next
    },
    async insertIntervals(input) {
      if (input.length === 0) return
      const now = new Date()
      await collections.simulationIntervals.insertMany(
        input.map((interval) => ({ ...interval, _id: randomUUID(), createdAt: now, deletedAt: null })),
        { ordered: true },
      )
    },
    listIntervals(runId, limit = 1000) {
      return collections.simulationIntervals
        .find({ runId, deletedAt: null })
        .sort({ intervalStart: 1, householdId: 1 })
        .limit(Math.min(Math.max(limit, 1), 1000))
        .toArray()
    },
    async insertSummaries(input) {
      if (input.length === 0) return
      const now = new Date()
      await collections.simulationSummaries.insertMany(
        input.map((summary) => ({ ...summary, _id: randomUUID(), createdAt: now, deletedAt: null })),
        { ordered: true },
      )
    },
    listSummaries(runId) {
      return collections.simulationSummaries.find({ runId, deletedAt: null }).sort({ householdId: 1, outcome: 1 }).toArray()
    },
    async softDeleteRun(id) {
      const result = await collections.simulationRuns.updateOne(
        { _id: id, deletedAt: null },
        { $set: { deletedAt: new Date() } },
      )
      return result.modifiedCount === 1
    },
  }
}

async function ensureLedgerCounter(
  collections: VoltCollections,
  organisationId: string,
  session: ClientSession,
): Promise<void> {
  const now = new Date()
  await collections.counters.updateOne(
    { _id: `ledger:${organisationId}` },
    {
      $setOnInsert: {
        _id: `ledger:${organisationId}`,
        organisationId,
        name: 'ledger',
        nextSequence: 0,
        createdAt: now,
        updatedAt: now,
      },
    },
    { upsert: true, session },
  )
}

function createLedgerRepository(collections: VoltCollections, client: MongoClient): LedgerRepository {
  return {
    async append(input) {
      const session = client.startSession()
      try {
        let event: LedgerEventDocument | undefined
        await session.withTransaction(async () => {
          await ensureLedgerCounter(collections, input.organisationId, session)
          const counter = await collections.counters.findOneAndUpdate(
            { _id: `ledger:${input.organisationId}` },
            { $inc: { nextSequence: 1 }, $set: { updatedAt: new Date() } },
            { returnDocument: 'after', session },
          )
          if (!counter) throw new Error('Ledger sequence counter could not be allocated')

          const previous = counter.nextSequence === 1
            ? null
            : await collections.ledgerEvents.findOne(
                { organisationId: input.organisationId, sequence: counter.nextSequence - 1 },
                { session },
              )
          if (counter.nextSequence > 1 && !previous) {
            throw new Error('Ledger chain is missing its previous event')
          }

          const payload = {
            organisationId: input.organisationId,
            sequence: counter.nextSequence,
            eventType: input.eventType,
            householdId: input.householdId,
            settlementDate: input.settlementDate,
            sourceRunId: input.sourceRunId,
            simulationResultDigest: input.simulationResultDigest,
            energyKwh: input.energyKwh,
            estimatedCreditInr: input.estimatedCreditInr,
            previousSeal: previous?.canonicalSeal ?? null,
          } satisfies Omit<LedgerEventDocument, '_id' | 'canonicalSeal' | 'createdAt'>

          event = {
            ...payload,
            _id: randomUUID(),
            canonicalSeal: createLedgerSeal(payload),
            createdAt: new Date(),
          }
          await collections.ledgerEvents.insertOne(event, { session })
        })

        if (!event) throw new Error('Ledger event was not created')
        return event
      } finally {
        await session.endSession()
      }
    },
    list(organisationId, limit = 100) {
      return collections.ledgerEvents
        .find({ organisationId })
        .sort({ sequence: -1 })
        .limit(Math.min(Math.max(limit, 1), 500))
        .toArray()
    },
  }
}

function createAuditRepository(collections: VoltCollections): AuditRepository {
  return {
    async append(input) {
      const document: AuditEventDocument = {
        _id: randomUUID(),
        organisationId: input.organisationId,
        actorUserId: input.actorUserId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        metadata: input.metadata ?? {},
        createdAt: new Date(),
      }
      await collections.auditEvents.insertOne(document)
      return document
    },
  }
}

export function createVoltRepositories(db: Db, client: MongoClient = getMongoClient()): VoltRepositories {
  const collections = getVoltCollections(db)
  return {
    organisations: createOrganisationRepository(collections, client),
    memberships: createMembershipRepository(collections),
    simulations: createSimulationRepository(collections),
    ledger: createLedgerRepository(collections, client),
    audit: createAuditRepository(collections),
  }
}
