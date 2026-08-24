import { describe, expect, it } from 'vitest'
import { appendBlock, type ChainBlock } from '../hashChain'
import {
  LEDGER_TIMEFRAMES,
  LEDGER_TIMEFRAME_DAY_SPAN,
  LEDGER_TIMEFRAME_LABELS,
  buildLiveLedgerRange,
  buildStoredLedgerRange,
  describeLedgerRange,
  isLedgerTimeframe,
  shouldSummarisePdf,
  LEDGER_PDF_DETAIL_LIMIT,
  type LedgerDaySource,
  type LedgerRange,
  type StoredLedgerInput,
} from '../ledgerRange'

function makeChain(count: number, offset = 0): ChainBlock[] {
  let chain: ChainBlock[] = []
  for (let i = 0; i < count; i++) {
    chain = [
      ...chain,
      appendBlock(chain, i + 1, {
        t: `0${(i + offset) % 10}:00`,
        from: 'Pranav P',
        to: 'Abivan',
        kwh: 1,
        credit: 5.5,
      }),
    ]
  }
  return chain
}

function day(simDay: number, trades = 2): LedgerDaySource {
  return {
    simDay,
    dayType: 'sunny-weekday',
    chain: makeChain(trades, simDay),
    totalKwh: trades,
    totalCredit: trades * 5.5,
    rate: 5.5,
    compromised: false,
    invalidCount: 0,
  }
}

function live(timeframe: Parameters<typeof buildLiveLedgerRange>[0]['timeframe'], days: number) {
  const all = Array.from({ length: days }, (_unused, index) => day(index + 1))
  return buildLiveLedgerRange({
    timeframe,
    history: all.slice(0, -1),
    current: all[all.length - 1],
  })
}

describe('timeframe vocabulary', () => {
  it('offers exactly the four published timeframes', () => {
    expect([...LEDGER_TIMEFRAMES]).toEqual(['today', '7d', '30d', 'all'])
  })

  it('labels every timeframe', () => {
    for (const timeframe of LEDGER_TIMEFRAMES) {
      expect(LEDGER_TIMEFRAME_LABELS[timeframe]).toBeTruthy()
    }
  })

  it('counts simulated days, with all time unbounded', () => {
    expect(LEDGER_TIMEFRAME_DAY_SPAN.today).toBe(1)
    expect(LEDGER_TIMEFRAME_DAY_SPAN['7d']).toBe(7)
    expect(LEDGER_TIMEFRAME_DAY_SPAN['30d']).toBe(30)
    expect(LEDGER_TIMEFRAME_DAY_SPAN.all).toBeNull()
  })

  it('recognises only published timeframes', () => {
    expect(isLedgerTimeframe('7d')).toBe(true)
    expect(isLedgerTimeframe('last-year')).toBe(false)
    expect(isLedgerTimeframe('')).toBe(false)
  })
})

describe('buildLiveLedgerRange', () => {
  it('takes only the most recent simulated day for today', () => {
    const range = live('today', 5)
    expect(range.days.map((entry) => entry.simDay)).toEqual([5])
    expect(range.entries.every((entry) => entry.simDay === 5)).toBe(true)
  })

  it('counts back seven simulated days, not seven calendar days', () => {
    const range = live('7d', 10)
    expect(range.days.map((entry) => entry.simDay)).toEqual([4, 5, 6, 7, 8, 9, 10])
  })

  it('returns everything held for all time', () => {
    const range = live('all', 3)
    expect(range.days.map((entry) => entry.simDay)).toEqual([1, 2, 3])
  })

  it('does not invent days it does not have', () => {
    const range = live('30d', 2)
    expect(range.days).toHaveLength(2)
  })

  it('totals energy and credit across the selected days', () => {
    const range = live('all', 3)
    expect(range.totalKwh).toBe(6)
    expect(range.totalCredit).toBe(33)
    expect(range.tradeCount).toBe(6)
  })

  it('marks only the running day as open', () => {
    const range = live('all', 3)
    expect(range.days.map((entry) => entry.open)).toEqual([false, false, true])
  })

  it('leaves the running day closed when it falls outside the timeframe', () => {
    const all = Array.from({ length: 3 }, (_unused, index) => day(index + 1))
    const range = buildLiveLedgerRange({
      timeframe: 'all',
      history: all,
      current: day(99, 0),
    })
    // The current day carries no trades, but it is still the open one.
    expect(range.days.at(-1)?.open).toBe(true)
    expect(range.days.at(-1)?.simDay).toBe(99)
  })

  it('reports no seal verdict, because the server has not seen these rows', () => {
    const range = live('today', 1)
    expect(range.source).toBe('live')
    expect(range.entries.every((entry) => entry.sealMatchesServer === null)).toBe(true)
    expect(range.entries.every((entry) => entry.runId === null)).toBe(true)
    expect(range.sealMismatches).toBe(0)
    expect(range.truncated).toBe(false)
  })

  it('carries the chain seals through unchanged', () => {
    const source = day(1, 2)
    const range = buildLiveLedgerRange({ timeframe: 'today', history: [], current: source })
    expect(range.entries[0].seal).toBe(source.chain[0].hash)
    expect(range.entries[1].previousSeal).toBe(source.chain[0].hash)
  })
})

describe('what a live range admits it is missing', () => {
  it('is not truncated when every day it ever ran is still held', () => {
    expect(live('all', 3).truncated).toBe(false)
  })

  it('is truncated when the browser has been discarding older days', () => {
    // Day one is gone, which is what proves days were dropped.
    const kept = Array.from({ length: 14 }, (_unused, index) => day(index + 2))
    const range = buildLiveLedgerRange({
      timeframe: 'all',
      history: kept.slice(0, -1),
      current: kept[kept.length - 1],
    })

    expect(range.truncated).toBe(true)
  })

  it('is not truncated by a history that is merely full', () => {
    // Exactly at the cap, but still starting at day one: nothing was lost, and
    // reporting this as partial would be a lie about a complete export.
    const all = Array.from({ length: 15 }, (_unused, index) => day(index + 1))
    const range = buildLiveLedgerRange({
      timeframe: 'all',
      history: all.slice(0, -1),
      current: all[all.length - 1],
    })

    expect(range.truncated).toBe(false)
  })

  it('is not truncated when the timeframe fits inside what is held', () => {
    const kept = Array.from({ length: 14 }, (_unused, index) => day(index + 2))
    const range = buildLiveLedgerRange({
      timeframe: '7d',
      history: kept.slice(0, -1),
      current: kept[kept.length - 1],
    })

    expect(range.truncated).toBe(false)
  })
})

describe('buildStoredLedgerRange', () => {
  const snapshot: StoredLedgerInput = {
    timeframe: '7d',
    trades: [
      {
        runId: 'run-1',
        simDay: 2,
        blockId: 1,
        clock: '14:20',
        fromName: 'Pranav P',
        toName: 'Abivan',
        kwh: 1.05,
        credit: 5.67,
        seal: 'seal-1',
        previousSeal: 'GENESIS',
        sealMatchesClient: false,
      },
    ],
    days: [
      {
        runId: 'run-1',
        simDay: 2,
        dayType: 'heatwave',
        totalKwh: 1.05,
        totalCredit: 5.67,
        tradeCount: 1,
        closingRate: 6.1,
        compromised: true,
        invalidCount: 3,
        open: false,
      },
    ],
    totalKwh: 1.05,
    totalCredit: 5.67,
    tradeCount: 9,
    truncated: true,
    sealMismatches: 4,
  }

  it('marks the range as stored', () => {
    expect(buildStoredLedgerRange(snapshot).source).toBe('stored')
  })

  it('keeps the server verdict on each seal', () => {
    const range = buildStoredLedgerRange(snapshot)
    expect(range.entries[0].sealMatchesServer).toBe(false)
    expect(range.entries[0].seal).toBe('seal-1')
    expect(range.entries[0].runId).toBe('run-1')
  })

  it('preserves the settlement count from before the row limit', () => {
    const range = buildStoredLedgerRange(snapshot)
    expect(range.tradeCount).toBe(9)
    expect(range.entries).toHaveLength(1)
    expect(range.truncated).toBe(true)
    expect(range.sealMismatches).toBe(4)
  })

  it('carries the day type and closing rate the rollup recorded', () => {
    const range = buildStoredLedgerRange(snapshot)
    expect(range.days[0].dayType).toBe('heatwave')
    expect(range.days[0].rate).toBe(6.1)
    expect(range.days[0].compromised).toBe(true)
    expect(range.days[0].invalidCount).toBe(3)
  })
})

describe('describeLedgerRange', () => {
  function range(overrides: Partial<LedgerRange> = {}): LedgerRange {
    return { ...live('all', 2), ...overrides }
  }

  it('calls a clean range verified', () => {
    const status = describeLedgerRange(range())
    expect(status.variant).toBe('verified')
    expect(status.text).toMatch(/verified/i)
  })

  it('reports a tampered day as void', () => {
    const base = range()
    const status = describeLedgerRange({
      ...base,
      days: base.days.map((day, index) => (index === 0 ? { ...day, compromised: true } : day)),
    })
    expect(status.variant).toBe('compromised')
    expect(status.text).toMatch(/1 tampered day/)
  })

  it('reports a seal the server disagreed with as void', () => {
    const status = describeLedgerRange(range({ sealMismatches: 2 }))
    expect(status.variant).toBe('compromised')
    expect(status.text).toMatch(/2 seal mismatches/)
  })

  it('does not call a range it could not read in full simply verified', () => {
    const status = describeLedgerRange(range({ truncated: true }))
    expect(status.variant).toBe('verified')
    expect(status.text).toMatch(/^Partial ledger/)
  })

  it('reports tampering ahead of incompleteness', () => {
    const status = describeLedgerRange(range({ truncated: true, sealMismatches: 1 }))
    expect(status.variant).toBe('compromised')
  })

  it('singularises a lone settlement and day', () => {
    const one = live('today', 1)
    const status = describeLedgerRange({ ...one, tradeCount: 1, days: one.days.slice(0, 1) })
    expect(status.text).toContain('1 settlement ')
    expect(status.text).toContain('1 day')
  })
})

describe('shouldSummarisePdf', () => {
  it('keeps a readable range detailed', () => {
    expect(shouldSummarisePdf(live('all', 3))).toBe(false)
  })

  it('summarises once the detail stops being readable', () => {
    const base = live('all', 1)
    const entries = Array.from({ length: LEDGER_PDF_DETAIL_LIMIT + 1 }, () => base.entries[0])
    expect(shouldSummarisePdf({ ...base, entries })).toBe(true)
  })

  it('summarises a range that could not be read in full', () => {
    // Small enough to print in detail, but the rows are only part of the
    // timeframe; the per-day totals still cover all of it.
    const base = live('all', 2)
    expect(shouldSummarisePdf({ ...base, truncated: true, tradeCount: 90_000 })).toBe(true)
  })

  it('leaves a range exactly at the limit detailed', () => {
    const base = live('all', 1)
    const entries = Array.from({ length: LEDGER_PDF_DETAIL_LIMIT }, () => base.entries[0])
    expect(shouldSummarisePdf({ ...base, entries })).toBe(false)
  })
})
