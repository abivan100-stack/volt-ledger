import { describe, it, expect } from 'vitest'
import { appendBlock, type ChainBlock } from '../hashChain'
import { buildChainPdf, type ChainPdfMeta } from '../chainPdf'

function makeChain(count: number): ChainBlock[] {
  let chain: ChainBlock[] = []
  for (let i = 0; i < count; i++) {
    chain = [
      ...chain,
      appendBlock(chain, i + 1, {
        t: `0${i}:00`,
        from: `Household ${i}`,
        to: `Household ${i + 1}`,
        kwh: 0.5 + i * 0.1,
        credit: 3 + i,
      }),
    ]
  }
  return chain
}

function makeMeta(overrides: Partial<ChainPdfMeta> = {}): ChainPdfMeta {
  return {
    dayTypeLabel: 'Sunny Weekday',
    rate: 5.5,
    totalKwh: 12.34,
    totalCredit: 67.89,
    statusText: 'Chain verified · 9 entries',
    statusVariant: 'verified',
    generatedAt: new Date(2026, 0, 15, 14, 30),
    ...overrides,
  }
}

describe('buildChainPdf', () => {
  it('returns a non-empty PDF blob for a populated chain', () => {
    const blob = buildChainPdf(makeChain(9), makeMeta())
    expect(blob.type).toBe('application/pdf')
    expect(blob.size).toBeGreaterThan(1000)
  })

  it('does not throw for an empty chain', () => {
    const blob = buildChainPdf([], makeMeta({ totalKwh: 0, totalCredit: 0 }))
    expect(blob.size).toBeGreaterThan(0)
  })

  it('paginates a long chain without throwing', () => {
    const blob = buildChainPdf(makeChain(80), makeMeta())
    expect(blob.size).toBeGreaterThan(1000)
  })

  it('renders the compromised status variant without throwing', () => {
    const blob = buildChainPdf(
      makeChain(3),
      makeMeta({ statusVariant: 'compromised', statusText: 'Seal broken · 2 entries' }),
    )
    expect(blob.size).toBeGreaterThan(0)
  })
})
