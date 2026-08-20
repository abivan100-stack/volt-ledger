import { describe, expect, it, vi } from 'vitest'
import type { Db } from 'mongodb'
import { collectionNames } from '../collections.js'
import { CLEARABLE_COLLECTIONS, clearVoltCollections, describeTransactionSupport } from './harness.js'

/**
 * The deletion path, exercised without a database.
 *
 * `clearVoltCollections` is the only code in the repository that removes data
 * wholesale, so what it refuses to do matters more than what it does: it checks
 * the database name itself rather than trusting its caller, and it only ever
 * empties Volt's own collections.
 */

interface FakeDb {
  databaseName: string
  cleared: string[]
  dropDatabase: ReturnType<typeof vi.fn>
  collection: (name: string) => { deleteMany: () => Promise<void> }
}

function fakeDb(databaseName: string): FakeDb {
  const cleared: string[] = []
  return {
    databaseName,
    cleared,
    dropDatabase: vi.fn(),
    collection(name: string) {
      return {
        deleteMany: async () => {
          cleared.push(name)
        },
      }
    },
  }
}

describe('CLEARABLE_COLLECTIONS', () => {
  it('is exactly the set of collections Volt owns', () => {
    expect([...CLEARABLE_COLLECTIONS].sort()).toEqual(Object.values(collectionNames).sort())
  })
})

describe('clearVoltCollections', () => {
  it('empties every Volt collection', async () => {
    const db = fakeDb('volt_test')
    await clearVoltCollections(db as unknown as Db)

    expect(db.cleared.sort()).toEqual([...CLEARABLE_COLLECTIONS].sort())
  })

  it('never drops the database, however it is pointed', async () => {
    const db = fakeDb('volt_test')
    await clearVoltCollections(db as unknown as Db)

    // Emptying known collections cannot harm anything the API does not own;
    // dropping the database could.
    expect(db.dropDatabase).not.toHaveBeenCalled()
  })

  it('refuses a database whose name does not say test, without deleting anything', async () => {
    for (const name of ['volt', 'production', 'admin']) {
      const db = fakeDb(name)
      await expect(clearVoltCollections(db as unknown as Db)).rejects.toThrow(/refusing/i)
      expect(db.cleared, name).toEqual([])
      expect(db.dropDatabase, name).not.toHaveBeenCalled()
    }
  })

  it('names the offending database so the mistake is obvious', async () => {
    const db = fakeDb('volt_production')
    await expect(clearVoltCollections(db as unknown as Db)).rejects.toThrow(/volt_production/)
  })

  it('checks the database it was handed, not the environment it was configured from', async () => {
    // A caller that resolved a safe config but passed a different Db must still
    // be stopped here.
    const db = fakeDb('customer_data')
    await expect(clearVoltCollections(db as unknown as Db)).rejects.toThrow(/refusing/i)
    expect(db.cleared).toEqual([])
  })
})

describe('describeTransactionSupport', () => {
  it('accepts a replica set', () => {
    const result = describeTransactionSupport({ setName: 'rs0' })
    expect(result.supported).toBe(true)
  })

  it('accepts a sharded cluster', () => {
    const result = describeTransactionSupport({ msg: 'isdbgrid' })
    expect(result.supported).toBe(true)
  })

  it('rejects a standalone server and explains why', () => {
    const result = describeTransactionSupport({})
    expect(result.supported).toBe(false)
    expect(result.reason).toMatch(/replica set/i)
  })
})
