import { MongoClient, type Db } from 'mongodb'
import { collectionNames, initializeVoltDatabase } from '../collections.js'
import { applyTestDnsServers } from './setupDns.js'
import {
  isDedicatedTestDatabaseName,
  resolveTestDatabase,
  type TestDatabaseConfig,
  type TestDatabaseResolution,
} from './testDatabase.js'

/**
 * Connection and cleanup for the integration suite.
 *
 * Nothing here reaches for `config/env.ts`: the application's own connection
 * settings are deliberately out of scope, so a misconfigured integration run
 * cannot borrow production credentials.
 */

/** The only collections the suite will ever empty. */
export const CLEARABLE_COLLECTIONS: readonly string[] = Object.values(collectionNames)

export interface IntegrationContext {
  client: MongoClient
  db: Db
  /** False on a standalone server, where transactions are unavailable. */
  supportsTransactions: boolean
  transactionReason: string | null
}

/** Reads the ambient environment. Kept separate so the rules stay unit-testable. */
export function integrationDatabase(
  environment: NodeJS.ProcessEnv = process.env,
): TestDatabaseResolution {
  return resolveTestDatabase({
    MONGODB_TEST_URI: environment.MONGODB_TEST_URI,
    MONGODB_TEST_DB_NAME: environment.MONGODB_TEST_DB_NAME,
    MONGODB_DB_NAME: environment.MONGODB_DB_NAME,
  })
}

interface HelloResult {
  setName?: string
  msg?: string
}

/** Transactions need a replica set or a sharded cluster; a standalone cannot. */
export function describeTransactionSupport(hello: HelloResult): {
  supported: boolean
  reason: string | null
} {
  if (typeof hello.setName === 'string' && hello.setName.length > 0) {
    return { supported: true, reason: null }
  }
  if (hello.msg === 'isdbgrid') return { supported: true, reason: null }
  return {
    supported: false,
    reason:
      'MONGODB_TEST_URI points at a standalone server. MongoDB transactions require a replica set (even a single-node one) or a sharded cluster.',
  }
}

/**
 * Empties Volt's collections.
 *
 * Re-checks the database name rather than trusting the caller, and empties only
 * collections Volt owns — never `dropDatabase`, so a database that also holds
 * something else cannot be destroyed by a misconfiguration.
 */
export async function clearVoltCollections(db: Db): Promise<void> {
  if (!isDedicatedTestDatabaseName(db.databaseName)) {
    throw new Error(
      `Refusing to clear database "${db.databaseName}": it is not a dedicated test database. ` +
        'Its name must contain "test" and must not be a MongoDB internal database.',
    )
  }

  for (const name of CLEARABLE_COLLECTIONS) {
    await db.collection(name).deleteMany({})
  }
}

export async function connectTestDatabase(config: TestDatabaseConfig): Promise<IntegrationContext> {
  // Must happen before the client resolves an SRV record.
  applyTestDnsServers()

  const client = new MongoClient(config.uri, {
    appName: 'volt-ledger-integration-tests',
    connectTimeoutMS: 15_000,
    serverSelectionTimeoutMS: 15_000,
  })

  await client.connect()
  const db = client.db(config.databaseName)

  // Belt and braces: the connected database must still pass the guard before the
  // suite is allowed to touch it.
  if (!isDedicatedTestDatabaseName(db.databaseName)) {
    await client.close().catch(() => undefined)
    throw new Error(`Refusing to run against database "${db.databaseName}".`)
  }

  const hello = (await client.db('admin').command({ hello: 1 })) as HelloResult
  const transactions = describeTransactionSupport(hello)

  await clearVoltCollections(db)
  await initializeVoltDatabase(db)

  return {
    client,
    db,
    supportsTransactions: transactions.supported,
    transactionReason: transactions.reason,
  }
}

export async function closeTestDatabase(context: IntegrationContext): Promise<void> {
  await context.client.close()
}
