import type { Db, Document, MongoClient } from 'mongodb'
import { describe, expect, it, vi } from 'vitest'
import {
  createLedgerSeal,
  createVoltRepositories,
  hashInvitationToken,
  simulationDailyRunLimit,
} from './repositories.js'
import { collectionNames } from './collections.js'
import type { EmailDeliveryDocument, LedgerEventDocument } from './models.js'

type MemoryDocument = Document & { _id: string }

function matches(document: MemoryDocument, filter: Document): boolean {
  return Object.entries(filter).every(([key, expected]) => {
    if (key === '$or' && Array.isArray(expected)) {
      return expected.some((branch) => matches(document, branch as Document))
    }
    if (expected && typeof expected === 'object' && '$lt' in expected) {
      return document[key] < expected.$lt
    }
    if (expected && typeof expected === 'object' && '$lte' in expected) {
      return document[key] <= expected.$lte
    }
    if (expected && typeof expected === 'object' && '$in' in expected) {
      return (expected.$in as unknown[]).includes(document[key])
    }
    return document[key] === expected
  })
}

function createMemoryCollection() {
  const documents: MemoryDocument[] = []

  return {
    async insertOne(document: MemoryDocument) {
      documents.push(document)
      return { acknowledged: true, insertedId: document._id }
    },
    async insertMany(nextDocuments: MemoryDocument[]) {
      documents.push(...nextDocuments)
      return { acknowledged: true, insertedCount: nextDocuments.length, insertedIds: {} }
    },
    async findOne(filter: Document) {
      return documents.find((document) => matches(document, filter)) ?? null
    },
    async findOneAndUpdate(filter: Document, update: Document, options?: Document) {
      let document = documents.find((candidate) => matches(candidate, filter))
      if (!document && options?.upsert) {
        document = { _id: String(filter._id ?? `generated_${documents.length}`) }
        documents.push(document)
        if ('$setOnInsert' in update) Object.assign(document, update.$setOnInsert)
      }
      if (!document) return null
      if ('$set' in update) Object.assign(document, update.$set)
      if ('$inc' in update) {
        for (const [key, amount] of Object.entries(update.$inc as Record<string, number>)) {
          document[key] = Number(document[key] ?? 0) + amount
        }
      }
      return document
    },
    find(filter: Document) {
      let rows = documents.filter((document) => matches(document, filter))
      return {
        sort(sortSpec: Record<string, 1 | -1>) {
          const entries = Object.entries(sortSpec)
          rows = rows.toSorted((left, right) => {
            for (const [field, direction] of entries) {
              const leftValue = left[field]
              const rightValue = right[field]
              if (leftValue === rightValue) continue
              return (leftValue ?? '') > (rightValue ?? '') ? direction : -direction
            }
            return 0
          })
          return this
        },
        limit(count: number) {
          rows = rows.slice(0, count)
          return this
        },
        async toArray() {
          return rows
        },
      }
    },
    async updateOne(filter: Document, update: Document, options?: Document) {
      let document = documents.find((candidate) => matches(candidate, filter))
      if (!document && options?.upsert) {
        document = { _id: String(filter._id ?? `generated_${documents.length}`) }
        documents.push(document)
        if ('$setOnInsert' in update) Object.assign(document, update.$setOnInsert)
      }
      if (!document) return { acknowledged: true, matchedCount: 0, modifiedCount: 0 }
      if ('$set' in update) Object.assign(document, update.$set)
      if ('$inc' in update) {
        for (const [key, amount] of Object.entries(update.$inc as Record<string, number>)) {
          document[key] = Number(document[key] ?? 0) + amount
        }
      }
      return { acknowledged: true, matchedCount: 1, modifiedCount: 1 }
    },
    async updateMany(filter: Document, update: Document) {
      const matched = documents.filter((document) => matches(document, filter))
      for (const document of matched) {
        if ('$set' in update) Object.assign(document, update.$set)
        if ('$inc' in update) {
          for (const [key, amount] of Object.entries(update.$inc as Record<string, number>)) {
            document[key] = Number(document[key] ?? 0) + amount
          }
        }
      }
      return { acknowledged: true, matchedCount: matched.length, modifiedCount: matched.length }
    },
  }
}

function createMemoryDb(): Db {
  const collections = new Map<string, ReturnType<typeof createMemoryCollection>>()
  return {
    collection(name: string) {
      let collection = collections.get(name)
      if (!collection) {
        collection = createMemoryCollection()
        collections.set(name, collection)
      }
      return collection
    },
  } as unknown as Db
}

describe('Volt Mongo repositories', () => {
  it('stores only a hash of an invitation token and normalises its email', async () => {
    const repositories = createVoltRepositories(createMemoryDb(), {} as MongoClient)

    const created = await repositories.invitations.create({
      organisationId: 'org_123',
      email: ' Asha@Example.COM ',
      role: 'operator',
      invitedByUserId: 'user_123',
    })

    expect(created.token).toMatch(/^[a-f0-9]{64}$/)
    expect(created.invitation.email).toBe('asha@example.com')
    expect(created.invitation.tokenHash).toBe(hashInvitationToken(created.token))
    expect(created.invitation).not.toHaveProperty('token')
    expect(await repositories.invitations.findPendingByToken(created.token)).toMatchObject({
      _id: created.invitation._id,
      email: 'asha@example.com',
      role: 'operator',
    })
  })

  it('keeps active membership directory emails in sync with the identity record', async () => {
    const repositories = createVoltRepositories(createMemoryDb(), {} as MongoClient)
    await repositories.memberships.create({
      organisationId: 'org_123',
      userId: 'user_123',
      email: 'old@example.com',
      role: 'operator',
    })
    await repositories.memberships.create({
      organisationId: 'org_456',
      userId: 'user_123',
      email: 'old@example.com',
      role: 'viewer',
    })

    await repositories.memberships.syncEmail('user_123', ' New@Example.COM ')

    expect((await repositories.memberships.listForOrganisation('org_123'))[0]?.email).toBe('new@example.com')
    expect((await repositories.memberships.listForOrganisation('org_456'))[0]?.email).toBe('new@example.com')
  })

  it('queues invitation email data in the same transaction as the invitation', async () => {
    let transactionCount = 0
    const client = {
      startSession: () => ({
        withTransaction: async (operation: () => Promise<void>) => {
          transactionCount += 1
          await operation()
        },
        endSession: async () => undefined,
      }),
    } as unknown as MongoClient
    const db = createMemoryDb()
    const repositories = createVoltRepositories(db, client)

    const created = await repositories.invitations.create({
      organisationId: 'org_123',
      email: 'friend@example.com',
      role: 'operator',
      invitedByUserId: 'owner_123',
      token: 'raw-token-for-transaction-test',
      emailDelivery: {
        encryptedUrl: 'encrypted-payload',
        organisationName: 'Solar Commons',
      },
    })

    const deliveries = await (db.collection(collectionNames.emailDeliveries) as ReturnType<typeof createMemoryCollection>)
      .find({}).toArray()
    expect(transactionCount).toBe(1)
    expect(created.token).toBe('raw-token-for-transaction-test')
    expect(deliveries).toHaveLength(1)
    expect(deliveries[0]).toMatchObject({
      invitationId: created.invitation._id,
      idempotencyKey: `organisation-invitation:${created.invitation._id}`,
      to: 'friend@example.com',
      status: 'pending',
      encryptedUrl: 'encrypted-payload',
    })
  })

  it('claims, retries, and completes outbox records without double-claiming sent mail', async () => {
    const db = createMemoryDb()
    const repositories = createVoltRepositories(db, {} as MongoClient)
    const now = new Date('2030-01-01T00:00:00.000Z')
    const document: EmailDeliveryDocument = {
      _id: 'delivery_1',
      invitationId: 'invitation_1',
      idempotencyKey: 'organisation-invitation:invitation_1',
      kind: 'organisation_invitation',
      to: 'friend@example.com',
      organisationName: 'Solar Commons',
      role: 'operator',
      encryptedUrl: 'encrypted-payload',
      status: 'pending',
      attemptCount: 0,
      nextAttemptAt: now,
      lockedUntil: null,
      lastErrorCode: null,
      createdAt: now,
      updatedAt: now,
      sentAt: null,
    }
    await (db.collection(collectionNames.organisationInvitations) as ReturnType<typeof createMemoryCollection>).insertOne({
      _id: 'invitation_1',
      organisationId: 'org_123',
      email: 'friend@example.com',
      role: 'operator',
      tokenHash: 'token-hash',
      status: 'pending',
      invitedByUserId: 'user_123',
      expiresAt: new Date(now.getTime() + 60_000),
      acceptedByUserId: null,
      acceptedAt: null,
      revokedAt: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })
    await (db.collection(collectionNames.emailDeliveries) as ReturnType<typeof createMemoryCollection>).insertOne(document)

    const claimed = await repositories.emailDeliveries.claimNext(now, 60_000)
    expect(claimed).toMatchObject({ _id: 'delivery_1', status: 'processing', attemptCount: 1 })
    expect(await repositories.emailDeliveries.markFailed('delivery_1', new Date(now.getTime() + 1_000), 'TEMPORARY'))
      .toBe(true)
    const reclaimed = await repositories.emailDeliveries.claimNext(new Date(now.getTime() + 2_000), 60_000)
    expect(reclaimed?.attemptCount).toBe(2)
    expect(await repositories.emailDeliveries.markSent('delivery_1', now)).toBe(true)
    expect(await repositories.emailDeliveries.claimNext(new Date(now.getTime() + 3_000))).toBeNull()
  })

  it('cancels an undelivered invitation email once the invitation is revoked', async () => {
    const db = createMemoryDb()
    const client = {
      startSession: () => ({
        withTransaction: async (operation: () => Promise<void>) => operation(),
        endSession: async () => undefined,
      }),
    } as unknown as MongoClient
    const repositories = createVoltRepositories(db, client)
    const created = await repositories.invitations.create({
      organisationId: 'org_123',
      email: 'friend@example.com',
      role: 'operator',
      invitedByUserId: 'owner_123',
      emailDelivery: { encryptedUrl: 'encrypted-payload', organisationName: 'Solar Commons' },
    })

    expect(await repositories.invitations.revoke('org_123', created.invitation._id)).toBe(true)
    expect(await repositories.emailDeliveries.claimNext()).toBeNull()
    const delivery = await (db.collection(collectionNames.emailDeliveries) as ReturnType<typeof createMemoryCollection>)
      .findOne({ invitationId: created.invitation._id })
    expect(delivery).toMatchObject({ status: 'cancelled' })
  })

  it('accepts an invitation and creates the membership in one transaction', async () => {
    let transactionCount = 0
    let endedSessionCount = 0
    const client = {
      startSession: () => ({
        withTransaction: async (operation: () => Promise<void>) => {
          transactionCount += 1
          await operation()
        },
        endSession: async () => {
          endedSessionCount += 1
        },
      }),
    } as unknown as MongoClient
    const repositories = createVoltRepositories(createMemoryDb(), client)
    const created = await repositories.invitations.create({
      organisationId: 'org_123',
      email: 'friend@example.com',
      role: 'operator',
      invitedByUserId: 'owner_123',
    })

    const accepted = await repositories.invitations.accept(
      created.token,
      'user_456',
      'FRIEND@example.com',
    )

    expect(accepted.invitation).toMatchObject({
      _id: created.invitation._id,
      status: 'accepted',
      acceptedByUserId: 'user_456',
      email: 'friend@example.com',
    })
    expect(accepted.membership).toMatchObject({
      organisationId: 'org_123',
      userId: 'user_456',
      email: 'friend@example.com',
      role: 'operator',
    })
    expect(await repositories.invitations.findPendingByToken(created.token)).toBeNull()
    expect(transactionCount).toBe(1)
    expect(endedSessionCount).toBe(1)
  })

  it('revokes expired pending invitations without deleting their history', async () => {
    const repositories = createVoltRepositories(createMemoryDb(), {} as MongoClient)
    const created = await repositories.invitations.create({
      organisationId: 'org_123',
      email: 'expired@example.com',
      role: 'viewer',
      invitedByUserId: 'user_123',
    })

    const expiryCheck = new Date(created.invitation.expiresAt.getTime() + 1)
    expect(await repositories.invitations.expirePending(expiryCheck)).toBe(1)
    expect(await repositories.invitations.expirePending(expiryCheck)).toBe(0)
    expect(await repositories.invitations.findPendingByToken(created.token)).toBeNull()
    expect(await repositories.invitations.listForOrganisation('org_123')).toMatchObject([
      { _id: created.invitation._id, status: 'revoked', deletedAt: null },
    ])
  })

  it('creates an organisation and its owner membership in one transaction', async () => {
    let transactionCount = 0
    let endedSessionCount = 0
    const client = {
      startSession: () => ({
        withTransaction: async (operation: () => Promise<void>) => {
          transactionCount += 1
          await operation()
        },
        endSession: async () => {
          endedSessionCount += 1
        },
      }),
    } as unknown as MongoClient
    const repositories = createVoltRepositories(createMemoryDb(), client)

    const created = await repositories.organisations.createWithOwner({
      name: 'Demo neighbourhood',
      slug: 'demo-neighbourhood',
      createdByUserId: 'user_123',
    })

    expect(created.membership).toMatchObject({
      organisationId: created.organisation._id,
      userId: 'user_123',
      role: 'owner',
    })
    expect(await repositories.organisations.listForUser('user_123')).toEqual([created.organisation])
    expect(transactionCount).toBe(1)
    expect(endedSessionCount).toBe(1)
  })

  it('changes and removes non-owner memberships transactionally while protecting owners', async () => {
    const client = {
      startSession: () => ({
        withTransaction: async (operation: () => Promise<void>) => operation(),
        endSession: async () => undefined,
      }),
    } as unknown as MongoClient
    const repositories = createVoltRepositories(createMemoryDb(), client)
    await repositories.memberships.create({
      organisationId: 'org_123',
      userId: 'user_owner',
      email: 'owner@example.com',
      role: 'owner',
    })
    const created = await repositories.memberships.create({
      organisationId: 'org_123',
      userId: 'user_456',
      email: 'operator@example.com',
      role: 'operator',
    })

    const updated = await repositories.memberships.updateRole('org_123', 'user_456', 'viewer', 'user_owner')
    expect(updated).toMatchObject({ _id: created._id, role: 'viewer' })
    const removed = await repositories.memberships.remove('org_123', 'user_456', 'user_owner')
    expect(removed).toMatchObject({ _id: created._id, role: 'viewer' })
    expect(await repositories.memberships.find('org_123', 'user_456')).toBeNull()

    await expect(repositories.memberships.remove('org_123', 'user_owner', 'user_owner')).rejects.toThrow(
      'OWNER_PROTECTED',
    )

    await repositories.memberships.create({
      organisationId: 'org_123',
      userId: 'user_admin',
      email: 'admin@example.com',
      role: 'admin',
    })
    await expect(repositories.memberships.updateRole('org_123', 'user_admin', 'viewer', 'user_admin')).rejects.toThrow(
      'MEMBERSHIP_ROLE_FORBIDDEN',
    )
  })

  it('transfers ownership atomically and records the new roles', async () => {
    let transactionCount = 0
    const client = {
      startSession: () => ({
        withTransaction: async (operation: () => Promise<void>) => {
          transactionCount += 1
          await operation()
        },
        endSession: async () => undefined,
      }),
    } as unknown as MongoClient
    const db = createMemoryDb()
    const repositories = createVoltRepositories(db, client)
    await repositories.memberships.create({
      organisationId: 'org_123',
      userId: 'user_owner',
      email: 'owner@example.com',
      role: 'owner',
    })
    await repositories.memberships.create({
      organisationId: 'org_123',
      userId: 'user_admin',
      email: 'admin@example.com',
      role: 'admin',
    })

    await expect(repositories.memberships.transferOwnership('org_123', 'user_owner', 'user_owner')).rejects.toThrow(
      'OWNER_TRANSFER_INVALID',
    )

    const transferred = await repositories.memberships.transferOwnership(
      'org_123',
      'user_owner',
      'user_admin',
    )

    expect(transferred).toMatchObject({
      previousOwner: { userId: 'user_owner', role: 'admin' },
      newOwner: { userId: 'user_admin', role: 'owner' },
    })
    expect(await repositories.memberships.find('org_123', 'user_owner')).toMatchObject({ role: 'admin' })
    expect(await repositories.memberships.find('org_123', 'user_admin')).toMatchObject({ role: 'owner' })
    expect(await db.collection('audit_events').find({}).toArray()).toEqual([
      expect.objectContaining({
        action: 'membership.owner_transferred',
        entityType: 'organisation',
        entityId: 'org_123',
        metadata: { previousOwnerUserId: 'user_owner', newOwnerUserId: 'user_admin' },
      }),
    ])
    expect(await repositories.audit.listForOrganisation('org_123')).toMatchObject([
      { action: 'membership.owner_transferred', entityId: 'org_123' },
    ])
    expect(transactionCount).toBe(1)
  })

  it('creates organisations and memberships and hides soft-deleted organisations', async () => {
    const db = createMemoryDb()
    const repositories = createVoltRepositories(db, {} as MongoClient)

    const organisation = await repositories.organisations.create({
      name: 'Demo neighbourhood',
      slug: 'demo-neighbourhood',
      createdByUserId: 'user_123',
    })
    await repositories.memberships.create({
      organisationId: organisation._id,
      userId: 'user_123',
      role: 'owner',
    })
    await repositories.invitations.create({
      organisationId: organisation._id,
      email: 'invitee@example.com',
      role: 'operator',
      invitedByUserId: 'user_123',
    })
    const run = await repositories.simulations.createRun({
      organisationId: organisation._id,
      requestedByUserId: 'user_123',
      seed: 'archive-seed',
      modelVersion: 'monte-carlo-v1',
      inputSnapshot: { sampleCount: 10 },
      inputDigest: 'archive-input',
    })

    expect(await repositories.organisations.findById(organisation._id)).toEqual(organisation)
    expect(await repositories.organisations.listForUser('user_123')).toEqual([organisation])
    expect(await repositories.memberships.find(organisation._id, 'user_123')).toMatchObject({ role: 'owner' })

    expect(await repositories.organisations.softDelete(organisation._id, 'user_123')).toBe(true)
    expect(await repositories.organisations.findById(organisation._id)).toBeNull()
    expect(await repositories.memberships.find(organisation._id, 'user_123')).toBeNull()
    expect(await repositories.invitations.listForOrganisation(organisation._id)).toHaveLength(0)
    expect(await repositories.simulations.findRunById(run._id)).toBeNull()
    expect(await repositories.audit.listForOrganisation(organisation._id)).toMatchObject([
      { action: 'organisation.soft_deleted', actorUserId: 'user_123' },
    ])
  })

  it('refuses to soft-delete when the actor is no longer an active owner', async () => {
    const repositories = createVoltRepositories(createMemoryDb(), {} as MongoClient)
    const organisation = await repositories.organisations.create({
      name: 'Demo neighbourhood',
      slug: 'demo-neighbourhood',
      createdByUserId: 'user_123',
    })
    await repositories.memberships.create({
      organisationId: organisation._id,
      userId: 'user_123',
      role: 'admin',
    })

    expect(await repositories.organisations.softDelete(organisation._id, 'user_123')).toBe(false)
    expect(await repositories.organisations.findById(organisation._id)).toEqual(organisation)
    expect(await repositories.audit.listForOrganisation(organisation._id)).toEqual([])
  })

  it('paginates audit events with an action filter and stable cursor', async () => {
    const repositories = createVoltRepositories(createMemoryDb(), {} as MongoClient)
    const organisationId = 'org_123'
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2030-01-01T00:00:00.000Z'))
      await repositories.audit.append({
        organisationId,
        actorUserId: 'user_123',
        action: 'membership.role_updated',
        entityType: 'membership',
        entityId: 'member_1',
      })
      vi.setSystemTime(new Date('2030-01-01T00:00:01.000Z'))
      await repositories.audit.append({
        organisationId,
        actorUserId: 'user_123',
        action: 'organisation.created',
        entityType: 'organisation',
        entityId: organisationId,
      })
      vi.setSystemTime(new Date('2030-01-01T00:00:02.000Z'))
      const latest = await repositories.audit.append({
        organisationId,
        actorUserId: 'user_123',
        action: 'membership.role_updated',
        entityType: 'membership',
        entityId: 'member_2',
      })

      const firstPage = await repositories.audit.listPageForOrganisation(organisationId, {
        action: 'membership.role_updated',
        limit: 1,
      })
      expect(firstPage.events).toEqual([latest])
      expect(firstPage.nextCursor).toEqual({ createdAt: latest.createdAt, id: latest._id })

      const secondPage = await repositories.audit.listPageForOrganisation(organisationId, {
        action: 'membership.role_updated',
        before: firstPage.nextCursor,
        limit: 1,
      })
      expect(secondPage.events).toHaveLength(1)
      expect(secondPage.events[0]).toMatchObject({
        action: 'membership.role_updated',
        entityId: 'member_1',
      })
      expect(secondPage.nextCursor).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('enforces the simulation lifecycle and stores append-only result batches', async () => {
    const repositories = createVoltRepositories(createMemoryDb(), {} as MongoClient)
    const run = await repositories.simulations.createRun({
      organisationId: 'org_123',
      requestedByUserId: 'user_123',
      seed: 'demo-seed',
      modelVersion: 'monte-carlo-v1',
      inputSnapshot: { householdCount: 3 },
      inputDigest: 'input-digest',
    })

    expect(run.status).toBe('queued')
    await repositories.simulations.transitionRun(run._id, 'running')
    const completed = await repositories.simulations.transitionRun(run._id, 'completed', {
      resultDigest: 'result-digest',
    })
    expect(completed).toMatchObject({ status: 'completed', resultDigest: 'result-digest' })
    await expect(repositories.simulations.transitionRun(run._id, 'running')).rejects.toThrow(
      'Invalid simulation transition',
    )

    await repositories.simulations.insertIntervals([
      {
        organisationId: 'org_123',
        runId: run._id,
        householdId: 'household_1',
        intervalStart: new Date('2026-01-01T00:00:00.000Z'),
        intervalEnd: new Date('2026-01-01T00:15:00.000Z'),
        generatedKwh: 0.4,
        consumedKwh: 0.2,
        importedKwh: 0,
        exportedKwh: 0.2,
        estimatedCreditInr: 1.2,
        outcome: 'p50',
      },
    ])
    expect((await repositories.simulations.listIntervals(run._id)).length).toBe(1)
  })

  it('claims queued runs atomically and completes them with their result batch', async () => {
    let transactionCount = 0
    let endedSessionCount = 0
    const client = {
      startSession: () => ({
        withTransaction: async (operation: () => Promise<void>) => {
          transactionCount += 1
          await operation()
        },
        endSession: async () => {
          endedSessionCount += 1
        },
      }),
    } as unknown as MongoClient
    const repositories = createVoltRepositories(createMemoryDb(), client)
    const run = await repositories.simulations.createRun({
      organisationId: 'org_123',
      requestedByUserId: 'user_123',
      seed: 'worker-seed',
      modelVersion: 'monte-carlo-v1',
      inputSnapshot: { sampleCount: 10 },
      inputDigest: 'input-digest',
    })

    const claimed = await repositories.simulations.claimNextQueuedRun()
    expect(claimed).toMatchObject({ _id: run._id, status: 'running' })
    expect(await repositories.simulations.claimNextQueuedRun()).toBeNull()

    const completed = await repositories.simulations.completeRun({
      runId: run._id,
      resultDigest: 'result-digest',
      intervals: [
        {
          organisationId: 'org_123',
          runId: run._id,
          householdId: 'household_1',
          intervalStart: new Date('2030-01-01T00:00:00.000Z'),
          intervalEnd: new Date('2030-01-01T01:00:00.000Z'),
          generatedKwh: 1.2,
          consumedKwh: 0.8,
          importedKwh: 0,
          exportedKwh: 0.4,
          estimatedCreditInr: 2.2,
          outcome: 'p50',
        },
      ],
      summaries: [
        {
          organisationId: 'org_123',
          runId: run._id,
          householdId: 'household_1',
          outcome: 'p50',
          intervalCount: 1,
          generatedKwh: 1.2,
          consumedKwh: 0.8,
          importedKwh: 0,
          exportedKwh: 0.4,
          estimatedCreditInr: 2.2,
        },
      ],
    })

    expect(completed).toMatchObject({ status: 'completed', resultDigest: 'result-digest' })
    expect(await repositories.simulations.listIntervals(run._id)).toHaveLength(1)
    expect(await repositories.simulations.listSummaries(run._id)).toHaveLength(1)
    expect(transactionCount).toBe(2)
    expect(endedSessionCount).toBe(2)
  })

  it('reserves one daily simulation quota unit and rejects a full quota', async () => {
    const db = createMemoryDb()
    const repositories = createVoltRepositories(db, {} as MongoClient)
    const run = await repositories.simulations.createRun({
      organisationId: 'org_123',
      requestedByUserId: 'user_123',
      seed: 'quota-seed',
      modelVersion: 'monte-carlo-v1',
      inputSnapshot: { sampleCount: 10 },
      inputDigest: 'input-digest',
    })

    expect(run.status).toBe('queued')
    expect(await repositories.simulations.getDailyQuota('org_123')).toMatchObject({
      used: 1,
      limit: simulationDailyRunLimit,
      remaining: simulationDailyRunLimit - 1,
    })

    const usageDate = new Date().toISOString().slice(0, 10)
    await db.collection('simulation_usage').insertOne({
      _id: `simulation:org_456:${usageDate}`,
      organisationId: 'org_456',
      usageDate,
      runCount: simulationDailyRunLimit,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never)

    await expect(repositories.simulations.createRun({
      organisationId: 'org_456',
      requestedByUserId: 'user_123',
      seed: 'quota-seed',
      modelVersion: 'monte-carlo-v1',
      inputSnapshot: { sampleCount: 10 },
      inputDigest: 'input-digest',
    })).rejects.toThrow('SIMULATION_QUOTA_EXCEEDED')
    expect(await repositories.simulations.findRunById(run._id)).toEqual(run)
    expect(await repositories.simulations.listForOrganisation('org_456')).toHaveLength(0)
  })

  it('settles one completed run idempotently into a hash-linked ledger batch', async () => {
    const client = {
      startSession: () => ({
        withTransaction: async (operation: () => Promise<void>) => operation(),
        endSession: async () => undefined,
      }),
    } as unknown as MongoClient
    const repositories = createVoltRepositories(createMemoryDb(), client)
    const run = await repositories.simulations.createRun({
      organisationId: 'org_123',
      requestedByUserId: 'user_123',
      seed: 'settlement-seed',
      modelVersion: 'monte-carlo-v1',
      inputSnapshot: {
        simulationDate: '2030-01-01',
        households: [
          { id: 'household_1', pvKw: 4, baseLoadKw: 0.6 },
          { id: 'household_2', pvKw: 2, baseLoadKw: 0.8 },
        ],
      },
      inputDigest: 'input-digest',
    })
    await repositories.simulations.transitionRun(run._id, 'running')
    await repositories.simulations.completeRun({
      runId: run._id,
      resultDigest: 'result-digest',
      intervals: [],
      summaries: [{
        organisationId: 'org_123',
        runId: run._id,
        householdId: 'household_1',
        outcome: 'selected',
        intervalCount: 1,
        generatedKwh: 1,
        consumedKwh: 0.4,
        importedKwh: 0,
        exportedKwh: 0.6,
        estimatedCreditInr: 3.3,
      }, {
        organisationId: 'org_123',
        runId: run._id,
        householdId: 'household_2',
        outcome: 'selected',
        intervalCount: 1,
        generatedKwh: 0.8,
        consumedKwh: 0.5,
        importedKwh: 0,
        exportedKwh: 0.3,
        estimatedCreditInr: 1.65,
      }],
    })

    const first = await repositories.ledger.settleCompletedRun({
      organisationId: 'org_123',
      runId: run._id,
      outcome: 'selected',
      actorUserId: 'admin_123',
    })
    expect(first.alreadySettled).toBe(false)
    expect(first.events).toHaveLength(2)
    expect(first.events[0]).toMatchObject({
      sequence: 1,
      previousSeal: null,
      energyKwh: 0.6,
      estimatedCreditInr: 3.3,
      simulationResultDigest: 'result-digest',
      outcome: 'selected',
    })
    expect(first.events[1]).toMatchObject({ sequence: 2, previousSeal: first.events[0].canonicalSeal, householdId: 'household_2' })

    const adjustment = await repositories.ledger.appendAdjustment({
      organisationId: 'org_123',
      targetEventId: first.events[0]._id,
      actorUserId: 'admin_123',
      idempotencyKey: 'correction-1',
      energyKwh: -0.1,
      estimatedCreditInr: -0.55,
      reason: 'Corrected the synthetic export estimate',
    })
    expect(adjustment.alreadyApplied).toBe(false)
    expect(adjustment.event).toMatchObject({
      sequence: 3,
      eventType: 'adjustment',
      adjustmentTargetEventId: first.events[0]._id,
      adjustmentReason: 'Corrected the synthetic export estimate',
      actorUserId: 'admin_123',
      previousSeal: first.events[1].canonicalSeal,
      energyKwh: -0.1,
      estimatedCreditInr: -0.55,
    })
    const adjustmentRetry = await repositories.ledger.appendAdjustment({
      organisationId: 'org_123',
      targetEventId: first.events[0]._id,
      actorUserId: 'admin_123',
      idempotencyKey: 'correction-1',
      energyKwh: -0.1,
      estimatedCreditInr: -0.55,
      reason: 'Corrected the synthetic export estimate',
    })
    expect(adjustmentRetry).toEqual({ event: adjustment.event, alreadyApplied: true })
    const adjustmentFromAnotherAdmin = await repositories.ledger.appendAdjustment({
      organisationId: 'org_123',
      targetEventId: first.events[0]._id,
      actorUserId: 'admin_456',
      idempotencyKey: 'correction-1',
      energyKwh: -0.1,
      estimatedCreditInr: -0.55,
      reason: 'Corrected the synthetic export estimate',
    })
    expect(adjustmentFromAnotherAdmin).toEqual({ event: adjustment.event, alreadyApplied: true })
    await expect(repositories.ledger.appendAdjustment({
      organisationId: 'org_123',
      targetEventId: first.events[0]._id,
      actorUserId: 'admin_123',
      idempotencyKey: 'correction-1',
      energyKwh: -0.2,
      estimatedCreditInr: -1.1,
      reason: 'Conflicting correction',
    })).rejects.toThrow('LEDGER_IDEMPOTENCY_CONFLICT')

    const retry = await repositories.ledger.settleCompletedRun({
      organisationId: 'org_123',
      runId: run._id,
      outcome: 'selected',
      actorUserId: 'admin_123',
    })
    expect(retry.alreadySettled).toBe(true)
    expect(retry.events).toEqual(first.events)
    expect(await repositories.ledger.list('org_123')).toHaveLength(3)
    await expect(repositories.ledger.settleCompletedRun({
      organisationId: 'org_123',
      runId: run._id,
      outcome: 'p50',
      actorUserId: 'admin_123',
    })).rejects.toThrow('SIMULATION_ALREADY_SETTLED_DIFFERENT_OUTCOME')
  })

  it('creates a stable seal from the complete ledger link payload', () => {
    const payload: Omit<LedgerEventDocument, '_id' | 'canonicalSeal' | 'createdAt'> = {
      organisationId: 'org_123',
      sequence: 1,
      eventType: 'settlement',
      outcome: 'selected',
      actorUserId: 'admin_123',
      householdId: 'household_1',
      settlementDate: '2026-01-01',
      sourceRunId: 'run_123',
      simulationResultDigest: 'result-digest',
      energyKwh: 0.2,
      estimatedCreditInr: 1.2,
      previousSeal: null,
      adjustmentTargetEventId: null,
      adjustmentReason: null,
      idempotencyKey: null,
    }

    expect(createLedgerSeal(payload)).toBe(createLedgerSeal({ ...payload }))
    expect(createLedgerSeal({ ...payload, previousSeal: 'prior-seal' })).not.toBe(createLedgerSeal(payload))
  })
})
