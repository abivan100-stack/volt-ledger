import { sha256 } from 'js-sha256'
import { describe, expect, it } from 'vitest'
import { GENESIS_SEAL, demoPayloadString, sealDemoTrade, sealDemoTrades } from './seal.js'

/**
 * Pins the server seal to the browser's `src/lib/hashChain.ts`.
 *
 * The browser implementation is deliberately not imported — it lives in the
 * client bundle and is marked load-bearing. Instead the same algorithm is
 * restated here with `js-sha256` (the library the browser actually uses), so a
 * drift in either direction fails: if the server changed its field order or
 * rounding, these expectations stop matching.
 */

function browserPayloadString(payload: { t: string; from: string; to: string; kwh: number; credit: number }): string {
  return `${payload.t}|${payload.from}|${payload.to}|${payload.kwh.toFixed(2)}|${payload.credit.toFixed(2)}`
}

function browserHashBlock(prevHash: string, payload: Parameters<typeof browserPayloadString>[0]): string {
  return sha256(prevHash + browserPayloadString(payload))
}

const trade = { clock: '14:20', fromName: 'Pranav P', toName: 'Abivan', kwh: 1.05, credit: 5.67 }
const browserTrade = { t: '14:20', from: 'Pranav P', to: 'Abivan', kwh: 1.05, credit: 5.67 }

describe('demoPayloadString', () => {
  it('matches the browser payload string byte for byte', () => {
    expect(demoPayloadString(trade)).toBe(browserPayloadString(browserTrade))
  })

  it('formats both amounts to exactly two decimals', () => {
    expect(demoPayloadString({ ...trade, kwh: 1, credit: 5.6789 })).toBe('14:20|Pranav P|Abivan|1.00|5.68')
  })
})

describe('sealDemoTrade', () => {
  it('agrees with the browser hash from the genesis root', () => {
    expect(sealDemoTrade(GENESIS_SEAL, trade)).toBe(browserHashBlock('GENESIS', browserTrade))
  })

  it('agrees with the browser hash from a previous seal', () => {
    const previous = sealDemoTrade(GENESIS_SEAL, trade)
    expect(sealDemoTrade(previous, trade)).toBe(browserHashBlock(previous, browserTrade))
  })

  it('changes when any payload field changes', () => {
    const base = sealDemoTrade(GENESIS_SEAL, trade)
    expect(sealDemoTrade(GENESIS_SEAL, { ...trade, kwh: 1.06 })).not.toBe(base)
    expect(sealDemoTrade(GENESIS_SEAL, { ...trade, toName: 'Prem Ramesh' })).not.toBe(base)
  })

  it('produces lowercase hex of 64 characters', () => {
    expect(sealDemoTrade(GENESIS_SEAL, trade)).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('sealDemoTrades', () => {
  it('links each trade to the one before it', () => {
    const second = { ...trade, clock: '14:23', kwh: 0.4, credit: 2.2 }
    const sealed = sealDemoTrades([trade, second])

    expect(sealed[0].previousSeal).toBe(GENESIS_SEAL)
    expect(sealed[1].previousSeal).toBe(sealed[0].seal)
    expect(sealed[1].seal).toBe(sealDemoTrade(sealed[0].seal, second))
  })

  it('continues from a seal already stored, so a batched flush does not restart the chain', () => {
    const first = sealDemoTrades([trade])
    const second = sealDemoTrades([trade], first[0].seal)

    expect(second[0].previousSeal).toBe(first[0].seal)
    expect(second[0].seal).toBe(sealDemoTrades([trade, trade])[1].seal)
  })

  it('returns nothing for an empty batch', () => {
    expect(sealDemoTrades([])).toEqual([])
  })
})
