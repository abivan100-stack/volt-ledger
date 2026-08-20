import { createHash, randomBytes, randomUUID } from 'node:crypto'
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
  type OrganisationInvitationDocument,
  type InvitationRole,
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

const invitationRoles: readonly InvitationRole[] = ['admin', 'operator', 'viewer']
const simulationLeaseMs = 15 * 60 * 1000

export interface CreateOrganisationInput {
  name: string
  slug: string
  createdByUserId: string
  createdByUserEmail?: string | null
}

export interface CreateOrganisationWithOwnerResult {
  organisation: OrganisationDocument
  membership: MembershipDocument
}

export interface CreateMembershipInput {
  organisationId: string
  userId: string
  email?: string | null
  role: MembershipRole
}

export interface CreateInvitationInput {
  organisationId: string
  email: string
  role: InvitationRole
  invitedByUserId: string
}

export interface CreateInvitationResult {
  invitation: OrganisationInvitationDocument
  token: string
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
  updateRole(organisationId: string, userId: string, role: MembershipRole, actorUserId: string): Promise<MembershipDocument | null>
  remove(organisationId: string, userId: string, actorUserId: string): Promise<MembershipDocument | null>
  softDelete(organisationId: string, userId: string): Promise<boolean>
}

export interface SimulationRepository {
  createRun(input: CreateSimulationRunInput): Promise<SimulationRunDocument>
  findRunById(id: string): Promise<SimulationRunDocument | null>
  listForOrganisation(organisationId: string, limit?: number): Promise<SimulationRunDocument[]>
  claimNextQueuedRun(): Promise<SimulationRunDocument | null>
  transitionRun(id: string, status: SimulationStatus, details?: { resultDigest?: string; errorCode?: string }): Promise<SimulationRunDocument>
  completeRun(input: CompleteSimulationRunInput): Promise<SimulationRunDocument>
  insertIntervals(input: CreateSimulationIntervalInput[]): Promise<void>
  listIntervals(runId: string, limit?: number): Promise<SimulationIntervalDocument[]>
  insertSummaries(input: CreateSimulationSummaryInput[]): Promise<void>
  listSummaries(runId: string): Promise<SimulationSummaryDocument[]>
  softDeleteRun(id: string): Promise<boolean>
}

export interface CompleteSimulationRunInput {
  runId: string
  resultDigest: string
  intervals: CreateSimulationIntervalInput[]
  summaries: CreateSimulationSummaryInput[]
}

export interface LedgerRepository {
  append(input: AppendLedgerEventInput): Promise<LedgerEventDocument>
  list(organisationId: string, limit?: number): Promise<LedgerEventDocument[]>
}

export interface AuditRepository {
  append(input: CreateAuditEventInput): Promise<AuditEventDocument>
}

export interface InvitationRepository {
  create(input: CreateInvitationInput): Promise<CreateInvitationResult>
  findById(organisationId: string, invitationId: string): Promise<OrganisationInvitationDocument | null>
  findPendingByEmail(organisationId: string, email: string): Promise<OrganisationInvitationDocument | null>
  findPendingByToken(token: string): Promise<OrganisationInvitationDocument | null>
  listForOrganisation(organisationId: string): Promise<OrganisationInvitationDocument[]>
  revoke(organisationId: string, invitationId: string): Promise<boolean>
  accept(
    token: string,
    userId: string,
    userEmail: string,
  ): Promise<{ invitation: OrganisationInvitationDocument; membership: MembershipDocument }>
}

export interface VoltRepositories {
  organisations: OrganisationRepository
  memberships: MembershipRepository
  simulations: SimulationRepository
  ledger: LedgerRepository
  audit: AuditRepository
  invitations: InvitationRepository
}

export const invitationTtlMs = 7 * 24 * 60 * 60 * 1000

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

export function normaliseInvitationEmail(value: string): string {
  const email = value.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Invitation email is invalid')
  return email
}

export function createInvitationToken(): string {
  return randomBytes(32).toString('hex')
}

export function hashInvitationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function assertMembershipRole(role: MembershipRole): void {
  if (!membershipRoles.includes(role)) throw new Error(`Unsupported membership role: ${role}`)
}

function assertInvitationRole(role: InvitationRole): void {
  if (!invitationRoles.includes(role)) {
    throw new Error(`Unsupported invitation role: ${role}`)
  }
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
    email: input.email ? normaliseInvitationEmail(input.email) : null,
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
              email: input.createdByUserEmail,
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

function createMembershipRepository(collections: VoltCollections, client: MongoClient): MembershipRepository {
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
    async updateRole(organisationId, userId, role, actorUserId) {
      assertMembershipRole(role)
      const session = client.startSession()
      try {
        let updated: MembershipDocument | null = null
        await session.withTransaction(async () => {
          const current = await collections.memberships.findOne(
            { organisationId, userId, deletedAt: null },
            { session },
          )
          if (!current) return
          if (current.role === 'owner' || role === 'owner') throw new Error('OWNER_PROTECTED')
          if (current.role === role) {
            updated = current
            return
          }

          const now = new Date()
          const result = await collections.memberships.updateOne(
            { _id: current._id, role: current.role, deletedAt: null },
            { $set: { role, updatedAt: now } },
            { session },
          )
          if (result.modifiedCount !== 1) throw new Error('MEMBERSHIP_CHANGED')

          await collections.auditEvents.insertOne(
            {
              _id: randomUUID(),
              organisationId,
              actorUserId,
              action: 'membership.role_changed',
              entityType: 'membership',
              entityId: current._id,
              metadata: { userId, previousRole: current.role, role },
              createdAt: now,
            },
            { session },
          )
          updated = { ...current, role, updatedAt: now }
        })
        return updated
      } finally {
        await session.endSession()
      }
    },
    async remove(organisationId, userId, actorUserId) {
      const session = client.startSession()
      try {
        let removed: MembershipDocument | null = null
        await session.withTransaction(async () => {
          const current = await collections.memberships.findOne(
            { organisationId, userId, deletedAt: null },
            { session },
          )
          if (!current) return
          if (current.role === 'owner') throw new Error('OWNER_PROTECTED')

          const now = new Date()
          const result = await collections.memberships.updateOne(
            { _id: current._id, deletedAt: null },
            { $set: { deletedAt: now, updatedAt: now } },
            { session },
          )
          if (result.modifiedCount !== 1) throw new Error('MEMBERSHIP_CHANGED')

          await collections.auditEvents.insertOne(
            {
              _id: randomUUID(),
              organisationId,
              actorUserId,
              action: 'membership.removed',
              entityType: 'membership',
              entityId: current._id,
              metadata: { userId, previousRole: current.role },
              createdAt: now,
            },
            { session },
          )
          removed = { ...current, deletedAt: now, updatedAt: now }
        })
        return removed
      } finally {
        await session.endSession()
      }
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

function createSimulationRepository(collections: VoltCollections, client: MongoClient): SimulationRepository {
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
    listForOrganisation(organisationId, limit = 50) {
      return collections.simulationRuns
        .find({ organisationId, deletedAt: null })
        .sort({ createdAt: -1 })
        .limit(Math.min(Math.max(limit, 1), 100))
        .toArray()
    },
    async claimNextQueuedRun() {
      const now = new Date()
      return collections.simulationRuns.findOneAndUpdate(
        {
          deletedAt: null,
          $or: [
            { status: 'queued' },
            { status: 'running', startedAt: { $lt: new Date(now.getTime() - simulationLeaseMs) } },
          ],
        },
        { $set: { status: 'running', startedAt: now, errorCode: null } },
        { sort: { createdAt: 1 }, returnDocument: 'after' },
      )
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
    async completeRun(input) {
      const session = client.startSession()
      try {
        let completed: SimulationRunDocument | undefined
        await session.withTransaction(async () => {
          const current = await collections.simulationRuns.findOne(
            { _id: input.runId, status: 'running', deletedAt: null },
            { session },
          )
          if (!current) throw new Error('SIMULATION_RUN_NOT_RUNNING')

          const now = new Date()
          if (input.intervals.length > 0) {
            await collections.simulationIntervals.insertMany(
              input.intervals.map((interval) => ({
                ...interval,
                _id: randomUUID(),
                createdAt: now,
                deletedAt: null,
              })),
              { ordered: true, session },
            )
          }
          if (input.summaries.length > 0) {
            await collections.simulationSummaries.insertMany(
              input.summaries.map((summary) => ({
                ...summary,
                _id: randomUUID(),
                createdAt: now,
                deletedAt: null,
              })),
              { ordered: true, session },
            )
          }

          const update = await collections.simulationRuns.updateOne(
            { _id: input.runId, status: 'running', deletedAt: null },
            {
              $set: {
                status: 'completed',
                completedAt: now,
                resultDigest: input.resultDigest,
                errorCode: null,
              },
            },
            { session },
          )
          if (update.modifiedCount !== 1) throw new Error('SIMULATION_RUN_CHANGED')
          completed = {
            ...current,
            status: 'completed',
            completedAt: now,
            resultDigest: input.resultDigest,
            errorCode: null,
          }
        })
        if (!completed) throw new Error('SIMULATION_COMPLETE_FAILED')
        return completed
      } finally {
        await session.endSession()
      }
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
        .sort({ intervalStart: 1, householdId: 1, outcome: 1 })
        .limit(Math.min(Math.max(limit, 1), 10_000))
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

function createInvitationRepository(collections: VoltCollections, client: MongoClient): InvitationRepository {
  return {
    async create(input) {
      assertInvitationRole(input.role)
      const now = new Date()
      const token = createInvitationToken()
      const document: OrganisationInvitationDocument = {
        _id: randomUUID(),
        organisationId: input.organisationId,
        email: normaliseInvitationEmail(input.email),
        role: input.role,
        tokenHash: hashInvitationToken(token),
        status: 'pending',
        invitedByUserId: input.invitedByUserId,
        expiresAt: new Date(now.getTime() + invitationTtlMs),
        acceptedByUserId: null,
        acceptedAt: null,
        revokedAt: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      }
      await collections.organisationInvitations.insertOne(document)
      return { invitation: document, token }
    },
    findById(organisationId, invitationId) {
      return collections.organisationInvitations.findOne({
        _id: invitationId,
        organisationId,
        deletedAt: null,
      })
    },
    async findPendingByEmail(organisationId, email) {
      const invitation = await collections.organisationInvitations.findOne({
        organisationId,
        email: normaliseInvitationEmail(email),
        status: 'pending',
        deletedAt: null,
      })
      if (!invitation || invitation.expiresAt <= new Date()) return null
      return invitation
    },
    async findPendingByToken(token) {
      const invitation = await collections.organisationInvitations.findOne({
        tokenHash: hashInvitationToken(token),
        status: 'pending',
        deletedAt: null,
      })
      if (!invitation || invitation.expiresAt <= new Date()) return null
      return invitation
    },
    listForOrganisation(organisationId) {
      return collections.organisationInvitations
        .find({ organisationId, deletedAt: null })
        .sort({ createdAt: -1 })
        .toArray()
    },
    async revoke(organisationId, invitationId) {
      const now = new Date()
      const result = await collections.organisationInvitations.updateOne(
        { _id: invitationId, organisationId, status: 'pending', deletedAt: null },
        { $set: { status: 'revoked', revokedAt: now, updatedAt: now } },
      )
      return result.modifiedCount === 1
    },
    async accept(token, userId, userEmail) {
      const session = client.startSession()
      try {
        let result:
          | { invitation: OrganisationInvitationDocument; membership: MembershipDocument }
          | undefined

        await session.withTransaction(async () => {
          const invitation = await collections.organisationInvitations.findOne(
            {
              tokenHash: hashInvitationToken(token),
              status: 'pending',
              deletedAt: null,
            },
            { session },
          )
          if (!invitation) throw new Error('INVITATION_NOT_FOUND')
          if (invitation.expiresAt <= new Date()) throw new Error('INVITATION_EXPIRED')

          const normalisedEmail = normaliseInvitationEmail(userEmail)
          if (normalisedEmail !== invitation.email) throw new Error('INVITATION_EMAIL_MISMATCH')

          const existingMembership = await collections.memberships.findOne(
            { organisationId: invitation.organisationId, userId, deletedAt: null },
            { session },
          )
          if (existingMembership) throw new Error('MEMBERSHIP_EXISTS')

          const now = new Date()
          const membership: MembershipDocument = {
            _id: randomUUID(),
            organisationId: invitation.organisationId,
            userId,
            email: normalisedEmail,
            role: invitation.role,
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
          }
          const acceptedInvitation: OrganisationInvitationDocument = {
            ...invitation,
            status: 'accepted',
            acceptedByUserId: userId,
            acceptedAt: now,
            updatedAt: now,
          }

          const update = await collections.organisationInvitations.updateOne(
            { _id: invitation._id, status: 'pending', deletedAt: null },
            {
              $set: {
                status: 'accepted',
                acceptedByUserId: userId,
                acceptedAt: now,
                updatedAt: now,
              },
            },
            { session },
          )
          if (update.modifiedCount !== 1) throw new Error('INVITATION_CHANGED')

          try {
            await collections.memberships.insertOne(membership, { session })
          } catch (error) {
            if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) {
              throw new Error('MEMBERSHIP_EXISTS')
            }
            throw error
          }
          await collections.auditEvents.insertOne(
            {
              _id: randomUUID(),
              organisationId: invitation.organisationId,
              actorUserId: userId,
              action: 'membership.accepted',
              entityType: 'membership',
              entityId: membership._id,
              metadata: { invitationId: invitation._id, role: invitation.role },
              createdAt: now,
            },
            { session },
          )

          result = { invitation: acceptedInvitation, membership }
        })

        if (!result) throw new Error('INVITATION_ACCEPT_FAILED')
        return result
      } finally {
        await session.endSession()
      }
    },
  }
}

export function createVoltRepositories(db: Db, client: MongoClient = getMongoClient()): VoltRepositories {
  const collections = getVoltCollections(db)
  return {
    organisations: createOrganisationRepository(collections, client),
    memberships: createMembershipRepository(collections, client),
    simulations: createSimulationRepository(collections, client),
    ledger: createLedgerRepository(collections, client),
    audit: createAuditRepository(collections),
    invitations: createInvitationRepository(collections, client),
  }
}
