import { afterEach, describe, expect, it } from 'vitest'
import dns from 'node:dns'
import { applyDnsServers } from './setupDns.js'

const original = dns.getServers()

afterEach(() => {
  dns.setServers(original)
})

describe('applyDnsServers', () => {
  it('does nothing when no resolver override is configured', () => {
    expect(applyDnsServers()).toBeNull()
    expect(dns.getServers()).toEqual(original)
  })

  it('applies comma-separated resolver addresses', () => {
    expect(applyDnsServers(' 8.8.8.8 , 1.1.1.1 ')).toEqual(['8.8.8.8', '1.1.1.1'])
    expect(dns.getServers()).toEqual(['8.8.8.8', '1.1.1.1'])
  })
})
