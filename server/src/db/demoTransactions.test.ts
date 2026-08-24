import { describe, expect, it } from 'vitest'
import { isTransactionsUnsupported } from './demoRepository.js'

/**
 * Which failures mean "this deployment has no transactions".
 *
 * This is what decides between a deployment that can store demo data and one
 * that is told, once, that it cannot. Too narrow and a standalone `mongod`
 * reports an opaque storage error on every write instead of the 503 that tells
 * the browser to stop asking and carry on. Too broad and a genuine write
 * conflict on a replica set — an ordinary, retryable event — is mistaken for a
 * missing feature, switching persistence off for a cluster that was working.
 */
describe('isTransactionsUnsupported', () => {
  it('recognises the standalone server refusal by code', () => {
    expect(isTransactionsUnsupported({ code: 20, codeName: 'IllegalOperation' })).toBe(true)
  })

  it('recognises it by code name alone', () => {
    expect(isTransactionsUnsupported({ codeName: 'IllegalOperation' })).toBe(true)
  })

  it('recognises the message the driver surfaces', () => {
    expect(
      isTransactionsUnsupported(
        new Error('Transaction numbers are only allowed on a replica set member or mongos'),
      ),
    ).toBe(true)
  })

  it('does not mistake a write conflict for a missing feature', () => {
    expect(isTransactionsUnsupported({ code: 112, codeName: 'WriteConflict' })).toBe(false)
  })

  it('does not mistake a duplicate key for a missing feature', () => {
    expect(isTransactionsUnsupported({ code: 11000 })).toBe(false)
  })

  it('is false for anything that is not an error object', () => {
    expect(isTransactionsUnsupported(null)).toBe(false)
    expect(isTransactionsUnsupported(undefined)).toBe(false)
    expect(isTransactionsUnsupported('IllegalOperation')).toBe(false)
  })
})
