import type { Db, Document, MongoClient } from 'mongodb'
import { describe, expect, it } from 'vitest'
import { createLedgerSeal, createVoltRepositories } from './repositories.js'
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
