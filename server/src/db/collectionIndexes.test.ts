import type { Db, IndexDescription } from 'mongodb'
import { describe, expect, it } from 'vitest'
import { collectionNames, getCollectionSpecs, initializeVoltDatabase } from './collections.js'

/**
 * Bringing an existing database's indexes up to date.
 *
 * MongoDB will not redefine an index in place. Asking for one whose name is
 * already taken by a different key is an error, and since a batch fails as a
 * unit, a single changed definition takes the whole startup with it — never on
 * a fresh database, where nothing conflicts, but on every database that already
 * holds the older index, which is to say every real one. That is not a
 * hypothetical: it is what a changed `simulation_runs_claim_queue` did the first
 * time anyone restarted against a database that had the old one.
 */

/**
 * The two conflicts, which are not the same conflict.
 *
 * 86 is a clash of names — an index of that name exists with a different key.
 * 85 is a clash of keys — an index of that key exists with different options,
 * and it may well be called something else entirely.
 */
function conflict(code: 85 | 86): Error {
  return Object.assign(new Error('index conflict'), { code })
}

interface ExistingIndex {
  name: string
  key: Record<string, number>
}

interface Recorded {
  created: string[]
  dropped: string[]
  /** Every drop asked for, including ones that lost a race and threw. */
  dropAttempts: string[]
}

interface FakeOptions {
  /** Indexes the database already holds, by collection name. */
  existing?: Record<string, ExistingIndex[]>
  /** Raised when the named index is requested, until it has been dropped. */
  onCreate?: (collection: string, index: IndexDescription, recorded: Recorded) => void
  /** An index another process drops first, so our own drop finds it gone. */
  raceDrop?: string
}

/**
 * A database that answers index calls however the test asks it to.
 *
 * `initializeVoltDatabase` reaches every collection through `db.collection`, so
 * standing in for that exercises the whole reconciliation path without a server.
 * `dropIndex` refuses a name that is not there, exactly as MongoDB does — which
 * is the only way a test can tell that the code looked the index up rather than
 * assuming it went by the name being requested.
 */
function fakeDb(options: FakeOptions = {}): { db: Db; recorded: Recorded } {
  const recorded: Recorded = { created: [], dropped: [], dropAttempts: [] }
  const existing: Record<string, ExistingIndex[]> = {}
  for (const [name, indexes] of Object.entries(options.existing ?? {})) {
    existing[name] = [...indexes]
  }

  const collection = (name: string) => ({
    collectionName: name,
    createIndexes: async (indexes: IndexDescription[]) => {
      for (const index of indexes) {
        options.onCreate?.(name, index, recorded)
      }
      for (const index of indexes) {
        recorded.created.push(`${name}:${String(index.name)}`)
      }
      return []
    },
    listIndexes: () => ({
      toArray: async () => existing[name] ?? [],
    }),
    dropIndex: async (indexName: string) => {
      recorded.dropAttempts.push(`${name}:${indexName}`)
      const held = existing[name] ?? []
      const at = options.raceDrop === indexName ? -1 : held.findIndex((index) => index.name === indexName)
      if (at === -1) {
        // IndexNotFound, which is what dropping a guessed name would earn.
        throw Object.assign(new Error(`index not found with name [${indexName}]`), { code: 27 })
      }
      held.splice(at, 1)
      recorded.dropped.push(`${name}:${indexName}`)
      return {}
    },
  })

  const db = {
    listCollections: () => ({
      toArray: async () => getCollectionSpecs().map((spec) => ({ name: spec.name })),
    }),
    createCollection: async () => ({}),
    collection,
  } as unknown as Db

  return { db, recorded }
}

const RUNS = collectionNames.simulationRuns
const CLAIM_QUEUE = 'simulation_runs_claim_queue'

/** Raises the given conflict for the claim-queue index until it is dropped. */
function conflictUntilDropped(code: 85 | 86, droppedName: string) {
  return (collection: string, index: IndexDescription, recorded: Recorded): void => {
    if (index.name !== CLAIM_QUEUE) return
    if (recorded.dropAttempts.includes(`${collection}:${droppedName}`)) return
    throw conflict(code)
  }
}

describe('bringing indexes up to date', () => {
  it('creates every index a fresh database is missing', async () => {
    const { db, recorded } = fakeDb()

    await initializeVoltDatabase(db)

    const expected = getCollectionSpecs().reduce((total, spec) => total + spec.indexes.length, 0)
    expect(recorded.created).toHaveLength(expected)
    expect(recorded.dropped).toEqual([])
  })

  it('rebuilds an index whose key changed under the same name', async () => {
    // The exact failure that stopped the API starting: the key gained a leading
    // field and a partial filter, under a name the database already had.
    const { db, recorded } = fakeDb({
      existing: { [RUNS]: [{ name: CLAIM_QUEUE, key: { status: 1, startedAt: 1, createdAt: 1 } }] },
      onCreate: conflictUntilDropped(86, CLAIM_QUEUE),
    })

    await initializeVoltDatabase(db)

    expect(recorded.dropped).toEqual([`${RUNS}:${CLAIM_QUEUE}`])
    expect(recorded.created).toContain(`${RUNS}:${CLAIM_QUEUE}`)
  })

  it('rebuilds a matching key that is held under a different name', async () => {
    // An options conflict names no index of ours: the one in the way is an
    // index over the same key called something else. Dropping the name the code
    // wanted would earn IndexNotFound and stop startup just as dead.
    const wanted = getCollectionSpecs()
      .find((spec) => spec.name === RUNS)
      ?.indexes.find((index) => index.name === CLAIM_QUEUE)
    expect(wanted).toBeDefined()

    const { db, recorded } = fakeDb({
      existing: {
        [RUNS]: [{ name: 'claim_queue_from_an_older_release', key: wanted?.key as Record<string, number> }],
      },
      onCreate: conflictUntilDropped(85, 'claim_queue_from_an_older_release'),
    })

    await initializeVoltDatabase(db)

    expect(recorded.dropped).toEqual([`${RUNS}:claim_queue_from_an_older_release`])
    expect(recorded.created).toContain(`${RUNS}:${CLAIM_QUEUE}`)
  })

  it('still creates the other indexes on a collection that had one conflict', async () => {
    // The batch fails as a unit and does not say which index was at fault, so
    // the rest have to be retried rather than abandoned.
    const { db, recorded } = fakeDb({
      existing: { [RUNS]: [{ name: CLAIM_QUEUE, key: { status: 1 } }] },
      onCreate: conflictUntilDropped(86, CLAIM_QUEUE),
    })

    await initializeVoltDatabase(db)

    const spec = getCollectionSpecs().find((entry) => entry.name === RUNS)
    for (const index of spec?.indexes ?? []) {
      expect(recorded.created).toContain(`${RUNS}:${String(index.name)}`)
    }
  })

  it('raises the conflict rather than guessing when nothing explains it', async () => {
    // Reported as conflicting, yet the collection holds nothing of that name or
    // that key. Dropping something on a hunch is not the answer.
    const { db, recorded } = fakeDb({
      existing: { [RUNS]: [] },
      onCreate: (_collection, index) => {
        if (index.name === CLAIM_QUEUE) throw conflict(86)
      },
    })

    await expect(initializeVoltDatabase(db)).rejects.toThrow(/index conflict/)
    expect(recorded.dropped).toEqual([])
  })

  it('never drops the _id_ index', async () => {
    const { db, recorded } = fakeDb({
      existing: { [RUNS]: [{ name: '_id_', key: { _id: 1 } }] },
      onCreate: (_collection, index) => {
        if (index.name === CLAIM_QUEUE) throw conflict(85)
      },
    })

    await expect(initializeVoltDatabase(db)).rejects.toThrow(/index conflict/)
    expect(recorded.dropped).toEqual([])
  })

  it('carries on when another process dropped the index first', async () => {
    // The API and the worker start together and both run this. Losing the race
    // is not a failure: the other process wanted the index gone too.
    const { db, recorded } = fakeDb({
      existing: { [RUNS]: [{ name: CLAIM_QUEUE, key: { status: 1 } }] },
      raceDrop: CLAIM_QUEUE,
      onCreate: conflictUntilDropped(86, CLAIM_QUEUE),
    })

    await initializeVoltDatabase(db)

    expect(recorded.dropAttempts).toContain(`${RUNS}:${CLAIM_QUEUE}`)
    expect(recorded.dropped).toEqual([])
    expect(recorded.created).toContain(`${RUNS}:${CLAIM_QUEUE}`)
  })

  it('says which index it dropped when the rebuild fails', async () => {
    // Redefining means dropping first - MongoDB will hold neither two indexes
    // over one key nor two under one name - so there is a window with neither.
    // If the rebuild does not land, the state the database is actually in has
    // to be the state that gets reported.
    const { db } = fakeDb({
      existing: { [RUNS]: [{ name: CLAIM_QUEUE, key: { status: 1 } }] },
      onCreate: (collection, index, recorded) => {
        if (index.name !== CLAIM_QUEUE) return
        if (!recorded.dropAttempts.includes(`${collection}:${CLAIM_QUEUE}`)) throw conflict(86)
        throw Object.assign(new Error('no space left on device'), { code: 28 })
      },
    })

    let error: Error | null = null
    try {
      await initializeVoltDatabase(db)
    } catch (caught) {
      error = caught as Error
    }

    expect(error).not.toBeNull()
    expect(error?.message).toContain(CLAIM_QUEUE)
    expect(error?.message).toContain(RUNS)
    expect(error?.message).toContain('no longer has that index')
    // The cause is kept: whoever reads this still needs to know why.
    expect(error?.message).toContain('no space left on device')
  })

  it('does not drop an index over an unrelated failure', async () => {
    // Dropping a live index because a build ran out of disk would turn a bad
    // day into a worse one.
    const { db, recorded } = fakeDb({
      existing: { [RUNS]: [{ name: CLAIM_QUEUE, key: { status: 1 } }] },
      onCreate: (_collection, index) => {
        if (index.name === CLAIM_QUEUE) {
          throw Object.assign(new Error('no space left on device'), { code: 28 })
        }
      },
    })

    await expect(initializeVoltDatabase(db)).rejects.toThrow(/no space left/)
    expect(recorded.dropped).toEqual([])
  })
})
