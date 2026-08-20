import { describe, expect, it } from 'vitest'
import { integrationRequired } from './runner.js'

/**
 * The switch between "skip quietly" and "fail loudly". A staging run that
 * silently tested nothing would be worse than one that failed.
 */

describe('integrationRequired', () => {
  it('is off when the variable is absent', () => {
    expect(integrationRequired({})).toBe(false)
  })

  it('is off for the values people use to mean off', () => {
    for (const value of ['', '0', 'false']) {
      expect(integrationRequired({ VOLT_REQUIRE_INTEGRATION: value }), value).toBe(false)
    }
  })

  it('is on for any other value', () => {
    for (const value of ['1', 'true', 'yes']) {
      expect(integrationRequired({ VOLT_REQUIRE_INTEGRATION: value }), value).toBe(true)
    }
  })
})
