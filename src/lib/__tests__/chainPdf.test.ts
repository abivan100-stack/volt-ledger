import { describe, it, expect } from 'vitest'
import { appendBlock, type ChainBlock } from '../hashChain'
import { buildChainPdf, buildLedgerPdf, type ChainPdfMeta, type LedgerPdfMeta } from '../chainPdf'
import {
  buildLiveLedgerRange,
  LEDGER_PDF_DETAIL_LIMIT,
  type LedgerRange,
} from '../ledgerRange'

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

function makeRange(days: number, tradesPerDay = 3): LedgerRange {
  const all = Array.from({ length: days }, (_unused, index) => ({
    simDay: index + 1,
    dayType: 'sunny-weekday' as const,
    chain: makeChain(tradesPerDay),
    totalKwh: tradesPerDay,
    totalCredit: tradesPerDay * 5.5,
    rate: 5.5,
    compromised: false,
    invalidCount: 0,
  }))
  return buildLiveLedgerRange({
    timeframe: 'all',
    history: all.slice(0, -1),
    current: all[all.length - 1],
  })
}

function makeLedgerMeta(overrides: Partial<LedgerPdfMeta> = {}): LedgerPdfMeta {
  return {
    timeframeLabel: 'All time',
    statusText: 'Chain verified · 9 settlements across 3 days',
    statusVariant: 'verified',
    generatedAt: new Date(2026, 0, 15, 14, 30),
    ...overrides,
  }
}

describe('buildLedgerPdf', () => {
  it('returns a non-empty PDF blob for a populated range', () => {
    const blob = buildLedgerPdf(makeRange(3), makeLedgerMeta())
    expect(blob.type).toBe('application/pdf')
    expect(blob.size).toBeGreaterThan(1000)
  })

  it('does not throw for a range with nothing settled', () => {
    const blob = buildLedgerPdf(makeRange(1, 0), makeLedgerMeta())
    expect(blob.size).toBeGreaterThan(0)
  })

  it('renders the compromised variant without throwing', () => {
    const blob = buildLedgerPdf(
      makeRange(2),
      makeLedgerMeta({ statusVariant: 'compromised', statusText: 'Integrity void · 1 tampered day' }),
    )
    expect(blob.size).toBeGreaterThan(0)
  })

  it('paginates a long detailed range without throwing', () => {
    const blob = buildLedgerPdf(makeRange(20, 10), makeLedgerMeta())
    expect(blob.size).toBeGreaterThan(1000)
  })

  it('summarises rather than printing a range nobody could read', () => {
    const base = makeRange(3)
    const entries = Array.from({ length: LEDGER_PDF_DETAIL_LIMIT + 1 }, () => base.entries[0])
    const summarised = buildLedgerPdf({ ...base, entries }, makeLedgerMeta())
    const detailed = buildLedgerPdf(base, makeLedgerMeta())

    // One row per simulated day rather than one per settlement, so the
    // summarised report is the smaller document despite the larger range.
    expect(summarised.size).toBeLessThan(detailed.size)
  })

  it('renders a truncated range without throwing', () => {
    const base = makeRange(2)
    const blob = buildLedgerPdf({ ...base, truncated: true, tradeCount: 90_000 }, makeLedgerMeta())
    expect(blob.size).toBeGreaterThan(0)
  })

  it('renders a range with seal mismatches without throwing', () => {
    const base = makeRange(2)
    const flagged = {
      ...base,
      sealMismatches: 2,
      entries: base.entries.map((entry) => ({ ...entry, sealMatchesServer: false })),
    }
    expect(buildLedgerPdf(flagged, makeLedgerMeta()).size).toBeGreaterThan(0)
  })
})
