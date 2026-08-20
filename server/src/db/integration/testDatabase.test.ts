import { describe, expect, it } from 'vitest'
import {
  MONGODB_TEST_URI_HELP,
  PROTECTED_DATABASE_NAMES,
  isDedicatedTestDatabaseName,
  resolveTestDatabase,
} from './testDatabase.js'

/**
 * The guard that decides whether a database may be wiped. Every rule here exists
 * to make "the integration suite deleted my data" impossible, so each is pinned
 * individually and the failure messages are asserted too — an operator who hits
 * one needs to be told exactly what to change.
 */

const SAFE = {
  MONGODB_TEST_URI: 'mongodb://127.0.0.1:27017',
  MONGODB_TEST_DB_NAME: 'volt_test',
  MONGODB_DB_NAME: 'volt',
}

describe('resolveTestDatabase without a URI', () => {
  it('is unavailable and names the exact variable required', () => {
    const result = resolveTestDatabase({})
    expect(result.available).toBe(false)
    expect(result.available === false && result.reason).toContain('MONGODB_TEST_URI')
  })

  it('treats a blank or whitespace URI as unset', () => {
    for (const value of ['', '   ']) {
      const result = resolveTestDatabase({ ...SAFE, MONGODB_TEST_URI: value })
      expect(result.available, value).toBe(false)
      expect(result.available === false && result.reason).toContain('MONGODB_TEST_URI')
    }
  })

  it('offers help text that states both variables and the safety rule', () => {
    expect(MONGODB_TEST_URI_HELP).toContain('MONGODB_TEST_URI')
    expect(MONGODB_TEST_URI_HELP).toContain('MONGODB_TEST_DB_NAME')
    expect(MONGODB_TEST_URI_HELP).toMatch(/dedicated/i)
  })
})

describe('resolveTestDatabase URI validation', () => {
  it('accepts a standard and an SRV connection string', () => {
    for (const uri of ['mongodb://127.0.0.1:27017', 'mongodb+srv://cluster.example.net']) {
      expect(resolveTestDatabase({ ...SAFE, MONGODB_TEST_URI: uri }).available, uri).toBe(true)
    }
  })

  it('refuses anything that is not a MongoDB connection string', () => {
    for (const uri of ['http://localhost:27017', 'postgres://localhost', 'localhost:27017']) {
      const result = resolveTestDatabase({ ...SAFE, MONGODB_TEST_URI: uri })
      expect(result.available, uri).toBe(false)
      expect(result.available === false && result.reason).toMatch(/mongodb/i)
    }
  })

  it('trims surrounding whitespace rather than failing on it', () => {
    const result = resolveTestDatabase({ ...SAFE, MONGODB_TEST_URI: '  mongodb://127.0.0.1:27017  ' })
    expect(result.available).toBe(true)
    expect(result.available === true && result.config.uri).toBe('mongodb://127.0.0.1:27017')
  })
})

describe('resolveTestDatabase database naming', () => {
  it('uses MONGODB_TEST_DB_NAME when given', () => {
    const result = resolveTestDatabase({ ...SAFE, MONGODB_TEST_DB_NAME: 'volt_integration_test' })
    expect(result.available === true && result.config.databaseName).toBe('volt_integration_test')
  })

  it('falls back to the database named in the URI path', () => {
    const result = resolveTestDatabase({
      MONGODB_TEST_URI: 'mongodb://127.0.0.1:27017/volt_test',
      MONGODB_DB_NAME: 'volt',
    })
    expect(result.available === true && result.config.databaseName).toBe('volt_test')
  })

  it('reads the database out of an SRV URI with query parameters', () => {
    const result = resolveTestDatabase({
      MONGODB_TEST_URI: 'mongodb+srv://user:pw@cluster.example.net/volt_test?retryWrites=true&w=majority',
      MONGODB_DB_NAME: 'volt',
    })
    expect(result.available === true && result.config.databaseName).toBe('volt_test')
  })

  it('never invents a default name when none is given', () => {
    const result = resolveTestDatabase({
      MONGODB_TEST_URI: 'mongodb://127.0.0.1:27017',
      MONGODB_DB_NAME: 'volt',
    })
    expect(result.available).toBe(false)
    expect(result.available === false && result.reason).toContain('MONGODB_TEST_DB_NAME')
  })
})

describe('resolveTestDatabase safety rules', () => {
  it('requires the name to identify itself as a test database', () => {
    for (const name of ['volt', 'production', 'volt_prod', 'staging']) {
      const result = resolveTestDatabase({ ...SAFE, MONGODB_TEST_DB_NAME: name })
      expect(result.available, name).toBe(false)
      expect(result.available === false && result.reason).toMatch(/test/i)
    }
  })

  it('accepts names that clearly say test, in any case or position', () => {
    for (const name of ['volt_test', 'test_volt', 'voltTest', 'VOLT_TEST', 'volt-integration-test']) {
      expect(resolveTestDatabase({ ...SAFE, MONGODB_TEST_DB_NAME: name }).available, name).toBe(true)
    }
  })

  it('refuses a name matching the configured application database, even if it says test', () => {
    const result = resolveTestDatabase({
      MONGODB_TEST_URI: 'mongodb://127.0.0.1:27017',
      MONGODB_TEST_DB_NAME: 'volt_test',
      MONGODB_DB_NAME: 'volt_test',
    })
    expect(result.available).toBe(false)
    expect(result.available === false && result.reason).toMatch(/MONGODB_DB_NAME/)
  })

  it('compares the application database name case-insensitively', () => {
    const result = resolveTestDatabase({
      MONGODB_TEST_URI: 'mongodb://127.0.0.1:27017',
      MONGODB_TEST_DB_NAME: 'Volt_Test',
      MONGODB_DB_NAME: 'volt_test',
    })
    expect(result.available).toBe(false)
  })

  it('refuses MongoDB internal databases outright', () => {
    for (const name of PROTECTED_DATABASE_NAMES) {
      const result = resolveTestDatabase({ ...SAFE, MONGODB_TEST_DB_NAME: name })
      expect(result.available, name).toBe(false)
    }
  })

  it('refuses a name with characters MongoDB does not allow', () => {
    for (const name of ['volt test', 'volt/test', 'volt\\test', 'volt.test', 'volt"test', 'volt$test']) {
      const result = resolveTestDatabase({ ...SAFE, MONGODB_TEST_DB_NAME: name })
      expect(result.available, name).toBe(false)
    }
  })

  it('refuses a name longer than MongoDB permits', () => {
    const result = resolveTestDatabase({ ...SAFE, MONGODB_TEST_DB_NAME: `test_${'a'.repeat(64)}` })
    expect(result.available).toBe(false)
  })

  it('accepts the safe fixture, so the rules above are not vacuous', () => {
    const result = resolveTestDatabase(SAFE)
    expect(result.available).toBe(true)
    expect(result.available === true && result.config).toEqual({
      uri: 'mongodb://127.0.0.1:27017',
      databaseName: 'volt_test',
    })
  })
})

describe('isDedicatedTestDatabaseName', () => {
  it('is the last line of defence before anything is deleted', () => {
    expect(isDedicatedTestDatabaseName('volt_test')).toBe(true)
    expect(isDedicatedTestDatabaseName('volt')).toBe(false)
    expect(isDedicatedTestDatabaseName('admin')).toBe(false)
    expect(isDedicatedTestDatabaseName('')).toBe(false)
  })
})
