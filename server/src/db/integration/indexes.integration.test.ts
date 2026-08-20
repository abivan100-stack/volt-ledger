import { expect, it } from 'vitest'
import type { IndexDescription } from 'mongodb'
import { getCollectionSpecs } from '../collections.js'
import { describeIntegration } from './runner.js'

/**
 * Verifies that the indexes the code declares are the indexes the database
 * actually has.
 *
 * Driven from `getCollectionSpecs()` rather than a hand-written list, so adding
 * an index to the application automatically extends this check. The partial
 * filters matter most: several uniqueness rules only hold for rows that are not
 * soft-deleted, and an index created without its filter would silently forbid
 * re-using a slug or re-inviting an address after removal.
 */

interface LiveIndex {
  name: string
  key: Record<string, number>
  unique?: boolean
  partialFilterExpression?: Record<string, unknown>
  expireAfterSeconds?: number
}

describeIntegration('MongoDB indexes', (suite) => {
  const specs = getCollectionSpecs()

  it('creates every declared collection', async () => {
    const collections = await suite.db().listCollections({}, { nameOnly: true }).toArray()
    const names = collections.map((collection) => collection.name)

    for (const spec of specs) {
      expect(names, spec.name).toContain(spec.name)
    }
  })

  for (const spec of specs) {
    it(`applies every declared index on ${spec.name}`, async () => {
      const live = (await suite.db().collection(spec.name).indexes()) as unknown as LiveIndex[]
      const byName = new Map(live.map((index) => [index.name, index]))

      for (const declared of spec.indexes as IndexDescription[]) {
        const name = declared.name as string
        const actual = byName.get(name)
        expect(actual, `${spec.name}.${name} is missing`).toBeDefined()
        if (!actual) continue

        expect(actual.key, `${spec.name}.${name} key`).toEqual(declared.key)

        // A uniqueness rule that did not survive is a data-integrity hole.
        expect(Boolean(actual.unique), `${spec.name}.${name} unique`).toBe(
          Boolean(declared.unique),
        )

        if (declared.partialFilterExpression) {
          expect(
            actual.partialFilterExpression,
            `${spec.name}.${name} partial filter`,
          ).toEqual(declared.partialFilterExpression)
        } else {
          expect(
            actual.partialFilterExpression,
            `${spec.name}.${name} should have no partial filter`,
          ).toBeUndefined()
        }

        if (declared.expireAfterSeconds !== undefined) {
          expect(actual.expireAfterSeconds, `${spec.name}.${name} ttl`).toBe(
            declared.expireAfterSeconds,
          )
        }
      }
    })
  }

  it('is idempotent, so a redeploy does not fail on existing indexes', async () => {
    const { initializeVoltDatabase } = await import('../collections.js')

    // The harness already initialised once; doing it again must be a no-op.
    await expect(initializeVoltDatabase(suite.db())).resolves.toBeUndefined()

    const organisations = (await suite
      .db()
      .collection('organisations')
      .indexes()) as unknown as LiveIndex[]
    const slugIndexes = organisations.filter(
      (index) => index.name === 'organisations_slug_active_unique',
    )
    expect(slugIndexes).toHaveLength(1)
  })

  it('enforces the active-slug uniqueness rule only for live organisations', async () => {
    const organisations = (await suite
      .db()
      .collection('organisations')
      .indexes()) as unknown as LiveIndex[]
    const slugIndex = organisations.find(
      (index) => index.name === 'organisations_slug_active_unique',
    )

    expect(slugIndex?.unique).toBe(true)
    // Without this filter an archived organisation would keep its slug reserved.
    expect(slugIndex?.partialFilterExpression).toEqual({ deletedAt: null })
  })
})
