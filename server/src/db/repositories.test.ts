import type { Db, Document, MongoClient } from 'mongodb'
import { describe, expect, it } from 'vitest'
import { createLedgerSeal, createVoltRepositories, hashInvitationToken } from './repositories.js'
import type { LedgerEventDocument } from './models.js'

type MemoryDocument = Document & { _id: string }

function matches(document: MemoryDocument, filter: Document): boolean {
  return Object.entries(filter).every(([key, expected]) => {
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
    find(filter: Document) {
      let rows = documents.filter((document) => matches(document, filter))
      return {
        sort(sortSpec: Record<string, 1 | -1>) {
          const [[field, direction]] = Object.entries(sortSpec)
          rows = rows.toSorted((left, right) => {
            const leftValue = left[field]
            const rightValue = right[field]
            if (leftValue === rightValue) return 0
            return (leftValue ?? '') > (rightValue ?? '') ? direction : -direction
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
    async updateOne(filter: Document, update: Document) {
      const document = documents.find((candidate) => matches(candidate, filter))
      if (!document) return { acknowledged: true, matchedCount: 0, modifiedCount: 0 }
      if ('$set' in update) Object.assign(document, update.$set)
      return { acknowledged: true, matchedCount: 1, modifiedCount: 1 }
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

    await repositories.memberships.create({
      organisationId: 'org_123',
      userId: 'user_owner',
      email: 'owner@example.com',
      role: 'owner',
    })
    await expect(repositories.memberships.remove('org_123', 'user_owner', 'user_owner')).rejects.toThrow(
      'OWNER_PROTECTED',
    )
  })

  it('creates organisations and memberships and hides soft-deleted organisations', async () => {
    const repositories = createVoltRepositories(createMemoryDb(), {} as MongoClient)

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

    expect(await repositories.organisations.findById(organisation._id)).toEqual(organisation)
    expect(await repositories.organisations.listForUser('user_123')).toEqual([organisation])
    expect(await repositories.memberships.find(organisation._id, 'user_123')).toMatchObject({ role: 'owner' })

    expect(await repositories.organisations.softDelete(organisation._id)).toBe(true)
    expect(await repositories.organisations.findById(organisation._id)).toBeNull()
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

  it('creates a stable seal from the complete ledger link payload', () => {
    const payload: Omit<LedgerEventDocument, '_id' | 'canonicalSeal' | 'createdAt'> = {
      organisationId: 'org_123',
      sequence: 1,
      eventType: 'settlement',
      householdId: 'household_1',
      settlementDate: '2026-01-01',
      sourceRunId: 'run_123',
      simulationResultDigest: 'result-digest',
      energyKwh: 0.2,
      estimatedCreditInr: 1.2,
      previousSeal: null,
    }

    expect(createLedgerSeal(payload)).toBe(createLedgerSeal({ ...payload }))
    expect(createLedgerSeal({ ...payload, previousSeal: 'prior-seal' })).not.toBe(createLedgerSeal(payload))
  })
})
