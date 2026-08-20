import { afterAll, beforeAll, beforeEach, describe } from 'vitest'
import { MongoClient, type Db } from 'mongodb'
import { createVoltRepositories, type VoltRepositories } from '../repositories.js'
import {
  clearVoltCollections,
  closeTestDatabase,
  connectTestDatabase,
  integrationDatabase,
  type IntegrationContext,
} from './harness.js'

/**
 * Wraps a suite that needs a real MongoDB.
 *
 * Without `MONGODB_TEST_URI` the suite is skipped rather than failed, so
 * `npm run test:api` stays runnable on a laptop with no database. That would be
 * dangerous on its own — a staging run could pass while testing nothing — so
 * `npm run test:integration` sets `VOLT_REQUIRE_INTEGRATION`, which turns the
 * same missing configuration into a hard failure.
 */

const REQUIRE_INTEGRATION = 'VOLT_REQUIRE_INTEGRATION'

export interface IntegrationSuite {
  db: () => Db
  client: () => MongoClient
  repositories: () => VoltRepositories
  /** False on a standalone server; suites needing transactions should skip. */
  supportsTransactions: () => boolean
}

export function integrationRequired(environment: NodeJS.ProcessEnv = process.env): boolean {
  const value = environment[REQUIRE_INTEGRATION]
  return typeof value === 'string' && value.length > 0 && value !== '0' && value !== 'false'
}

export function describeIntegration(name: string, define: (suite: IntegrationSuite) => void): void {
  const resolution = integrationDatabase()

  if (!resolution.available) {
    if (integrationRequired()) {
      // Asked for explicitly, so silence would be the wrong answer.
      describe(name, () => {
        throw new Error(
          `${REQUIRE_INTEGRATION} is set but the test database is not usable.\n\n${resolution.reason}`,
        )
      })
      return
    }

    describe.skip(`${name} [skipped: MONGODB_TEST_URI is not set]`, () => {
      // Body never runs; the title carries the reason into the report.
    })
    return
  }

  const config = resolution.config
  let context: IntegrationContext | undefined
  let repositories: VoltRepositories | undefined

  describe(name, () => {
    beforeAll(async () => {
      context = await connectTestDatabase(config)
      repositories = createVoltRepositories(context.db, context.client)
    }, 60_000)

    afterAll(async () => {
      if (context) await closeTestDatabase(context)
      context = undefined
      repositories = undefined
    })

    beforeEach(async () => {
      if (context) await clearVoltCollections(context.db)
    })

    function required<T>(value: T | undefined, what: string): T {
      if (value === undefined) throw new Error(`${what} is not available until beforeAll has run`)
      return value
    }

    define({
      db: () => required(context, 'The test database').db,
      client: () => required(context, 'The Mongo client').client,
      repositories: () => required(repositories, 'The repositories'),
      supportsTransactions: () => required(context, 'The test database').supportsTransactions,
    })
  })
}
