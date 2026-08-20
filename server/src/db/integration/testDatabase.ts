/**
 * Decides whether a MongoDB database may be used — and wiped — by the
 * integration suite.
 *
 * The suite deletes data, so every rule here exists to make it impossible to
 * point at anything that matters. A database qualifies only when all of these
 * hold:
 *
 *  - `MONGODB_TEST_URI` is set and is a MongoDB connection string;
 *  - a database name is given explicitly, by `MONGODB_TEST_DB_NAME` or in the
 *    URI path — never defaulted, because defaulting is how the wrong database
 *    gets chosen;
 *  - the name says `test`, so a production name cannot be passed by accident;
 *  - the name differs from `MONGODB_DB_NAME`, the database the application
 *    itself uses;
 *  - the name is not a MongoDB internal database and is otherwise legal.
 *
 * When any rule fails the suite skips and says which variable to change. It
 * never falls back to a guess.
 */

/** Databases MongoDB itself owns. Never a test target. */
export const PROTECTED_DATABASE_NAMES = ['admin', 'local', 'config'] as const

/** Characters MongoDB forbids in a database name, plus whitespace. */
const ILLEGAL_NAME_CHARACTERS = /[\s/\\."$*<>:|?]/

/** MongoDB's own limit for a database name. */
const MAX_DATABASE_NAME_LENGTH = 63

export const MONGODB_TEST_URI_HELP = [
  'Integration tests need a dedicated, disposable MongoDB database.',
  '',
  'Set:',
  '  MONGODB_TEST_URI      connection string for a replica set (transactions require one)',
  '  MONGODB_TEST_DB_NAME  name of a dedicated database whose name contains "test"',
  '',
  'The database is emptied between tests, so it must not be one you care about,',
  'and it must differ from MONGODB_DB_NAME.',
].join('\n')

export interface TestDatabaseConfig {
  uri: string
  databaseName: string
}

export type TestDatabaseResolution =
  | { available: true; config: TestDatabaseConfig }
  | { available: false; reason: string }

export interface TestDatabaseEnvironment {
  MONGODB_TEST_URI?: string | undefined
  MONGODB_TEST_DB_NAME?: string | undefined
  MONGODB_DB_NAME?: string | undefined
}

function unavailable(reason: string): TestDatabaseResolution {
  return { available: false, reason }
}

/** Reads the database out of a connection string's path, if it has one. */
function databaseNameFromUri(uri: string): string | null {
  // Strip the scheme, then everything up to the first `/` after the host list.
  const withoutScheme = uri.replace(/^mongodb(\+srv)?:\/\//, '')
  const slash = withoutScheme.indexOf('/')
  if (slash === -1) return null

  const afterSlash = withoutScheme.slice(slash + 1)
  const name = afterSlash.split('?')[0] ?? ''
  return name.length > 0 ? name : null
}

/**
 * The final check before any deletion. Deliberately independent of
 * `resolveTestDatabase` so that a caller cannot skip it by constructing a config
 * by hand.
 */
export function isDedicatedTestDatabaseName(databaseName: string): boolean {
  if (databaseName.length === 0 || databaseName.length > MAX_DATABASE_NAME_LENGTH) return false
  if (ILLEGAL_NAME_CHARACTERS.test(databaseName)) return false
  if ((PROTECTED_DATABASE_NAMES as readonly string[]).includes(databaseName.toLowerCase())) {
    return false
  }
  return /test/i.test(databaseName)
}

export function resolveTestDatabase(
  environment: TestDatabaseEnvironment,
): TestDatabaseResolution {
  const uri = environment.MONGODB_TEST_URI?.trim()
  if (!uri) {
    return unavailable(`MONGODB_TEST_URI is not set.\n\n${MONGODB_TEST_URI_HELP}`)
  }

  if (!/^mongodb(\+srv)?:\/\//.test(uri)) {
    return unavailable(
      `MONGODB_TEST_URI must be a mongodb:// or mongodb+srv:// connection string.\n\n${MONGODB_TEST_URI_HELP}`,
    )
  }

  const explicitName = environment.MONGODB_TEST_DB_NAME?.trim()
  const databaseName = explicitName && explicitName.length > 0 ? explicitName : databaseNameFromUri(uri)

  if (!databaseName) {
    return unavailable(
      `MONGODB_TEST_DB_NAME is not set and MONGODB_TEST_URI names no database.\n\n${MONGODB_TEST_URI_HELP}`,
    )
  }

  if (databaseName.length > MAX_DATABASE_NAME_LENGTH) {
    return unavailable(
      `MONGODB_TEST_DB_NAME must be at most ${MAX_DATABASE_NAME_LENGTH} characters.`,
    )
  }

  if (ILLEGAL_NAME_CHARACTERS.test(databaseName)) {
    return unavailable(
      `MONGODB_TEST_DB_NAME "${databaseName}" contains characters MongoDB does not allow in a database name.`,
    )
  }

  if ((PROTECTED_DATABASE_NAMES as readonly string[]).includes(databaseName.toLowerCase())) {
    return unavailable(
      `MONGODB_TEST_DB_NAME must not be a MongoDB internal database (${PROTECTED_DATABASE_NAMES.join(', ')}).`,
    )
  }

  if (!/test/i.test(databaseName)) {
    return unavailable(
      `MONGODB_TEST_DB_NAME "${databaseName}" must contain "test", so a production database cannot be wiped by accident.\n\n${MONGODB_TEST_URI_HELP}`,
    )
  }

  const applicationName = environment.MONGODB_DB_NAME?.trim()
  if (applicationName && applicationName.toLowerCase() === databaseName.toLowerCase()) {
    return unavailable(
      `MONGODB_TEST_DB_NAME must differ from MONGODB_DB_NAME ("${applicationName}"); the integration suite empties the database it is given.`,
    )
  }

  return { available: true, config: { uri, databaseName } }
}
