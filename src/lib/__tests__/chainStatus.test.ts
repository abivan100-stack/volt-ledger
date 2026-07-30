import { describe, it, expect } from 'vitest'
import { chainStatusFor } from '../chainStatus'

describe('chainStatusFor', () => {
  it('returns compromised when compromised is true', () => {
    const result = chainStatusFor({
      compromised: true,
      restoredFlash: false,
      invalidCount: 2,
      chainLength: 10,
      headHash: 'abc123',
    })
    expect(result.variant).toBe('compromised')
    expect(result.text).toContain('SEAL BROKEN')
    expect(result.text).toContain('2 ENTRIES')
  })

  it('uses singular ENTRY for single invalid count', () => {
    const result = chainStatusFor({
      compromised: true,
      restoredFlash: false,
      invalidCount: 1,
      chainLength: 10,
      headHash: 'abc123',
    })
    expect(result.text).toContain('1 ENTRY')
  })

  it('returns restored when restoredFlash is true', () => {
    const result = chainStatusFor({
      compromised: false,
      restoredFlash: true,
      invalidCount: 0,
      chainLength: 15,
      headHash: 'abc123',
    })
    expect(result.variant).toBe('restored')
    expect(result.text).toContain('RE-SEALED')
    expect(result.text).toContain('15 ENTRIES')
  })

  it('returns verified when everything is fine', () => {
    const result = chainStatusFor({
      compromised: false,
      restoredFlash: false,
      invalidCount: 0,
      chainLength: 20,
      headHash: 'abcdef0123456789',
    })
    expect(result.variant).toBe('verified')
    expect(result.text).toContain('VERIFIED')
    expect(result.text).toContain('20 ENTRIES')
    expect(result.text).toContain('abcdef0123')
  })

  it('uses placeholder when headHash is null', () => {
    const result = chainStatusFor({
      compromised: false,
      restoredFlash: false,
      invalidCount: 0,
      chainLength: 0,
      headHash: null,
    })
    expect(result.text).toContain('··········')
  })

  it('compromised takes priority over restoredFlash', () => {
    const result = chainStatusFor({
      compromised: true,
      restoredFlash: true,
      invalidCount: 3,
      chainLength: 10,
      headHash: 'abc123',
    })
    expect(result.variant).toBe('compromised')
  })
})
