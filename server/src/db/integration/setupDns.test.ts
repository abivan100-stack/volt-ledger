import { afterEach, describe, expect, it } from 'vitest'
import dns from 'node:dns'
import { applyTestDnsServers } from './setupDns.js'

/**
 * The escape hatch for environments whose system resolver refuses lookups, which
 * makes a `mongodb+srv://` URI fail before any connection is attempted.
 *
 * Each case restores the resolver it found, so a test cannot leave the process
 * pointed somewhere unexpected.
 */

const original = dns.getServers()

afterEach(() => {
  dns.setServers(original)
})

describe('applyTestDnsServers', () => {
  it('does nothing when the variable is unset', () => {
    expect(applyTestDnsServers({})).toBeNull()
    expect(dns.getServers()).toEqual(original)
  })

  it('does nothing for a blank or comma-only value', () => {
    for (const value of ['', '   ', ',', ' , ']) {
      expect(applyTestDnsServers({ VOLT_TEST_DNS_SERVERS: value }), value).toBeNull()
    }
    expect(dns.getServers()).toEqual(original)
  })

  it('applies a single resolver', () => {
    expect(applyTestDnsServers({ VOLT_TEST_DNS_SERVERS: '8.8.8.8' })).toEqual(['8.8.8.8'])
    expect(dns.getServers()).toEqual(['8.8.8.8'])
  })

  it('applies several, trimming whitespace around each', () => {
    const applied = applyTestDnsServers({ VOLT_TEST_DNS_SERVERS: ' 8.8.8.8 , 1.1.1.1 ' })
    expect(applied).toEqual(['8.8.8.8', '1.1.1.1'])
    expect(dns.getServers()).toEqual(['8.8.8.8', '1.1.1.1'])
  })
})
