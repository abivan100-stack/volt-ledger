import { describe, it, expect } from 'vitest'
import { appendBlock, type ChainBlock } from '../hashChain'
import { chainToCsv, ledgerDaysToCsv, ledgerRangeToCsv } from '../chainExport'
import { buildLiveLedgerRange, buildStoredLedgerRange } from '../ledgerRange'

function makeChain(): ChainBlock[] {
  const first = appendBlock([], 1, { t: '08:42', from: 'Alice', to: 'Bob', kwh: 1.2, credit: 6.6 })
  const second = appendBlock([first], 2, { t: '08:44', from: 'Carol, Jr.', to: 'Dave "D"', kwh: 0.5, credit: 2.75 })
  return [first, second]
}

describe('chainToCsv', () => {
  it('emits a header row followed by one row per block', () => {
    const csv = chainToCsv(makeChain())
    const lines = csv.split('\n')
    expect(lines[0]).toBe('id,time,from,to,kwh,credit,hash,prevHash')
    expect(lines).toHaveLength(3)
  })

  it('formats kwh and credit to two decimal places', () => {
    const csv = chainToCsv(makeChain())
    const firstRow = csv.split('\n')[1]
    expect(firstRow).toContain('1.20')
    expect(firstRow).toContain('6.60')
  })

  it('quotes and escapes fields containing commas or quotes', () => {
    const csv = chainToCsv(makeChain())
    const secondRow = csv.split('\n')[2]
    expect(secondRow).toContain('"Carol, Jr."')
    expect(secondRow).toContain('"Dave ""D"""')
  })

  it('emits just the header for an empty chain', () => {
    expect(chainToCsv([])).toBe('id,time,from,to,kwh,credit,hash,prevHash')
  })
})

describe('ledgerRangeToCsv', () => {
  function liveRange() {
    return buildLiveLedgerRange({
      timeframe: 'all',
      history: [],
      current: {
        simDay: 4,
        dayType: 'sunny-weekday',
        chain: makeChain(),
        totalKwh: 1,
        totalCredit: 5.5,
        rate: 5.5,
        compromised: false,
        invalidCount: 0,
      },
    })
  }

  it('names every column, including the ones only stored rows fill', () => {
    const [header] = ledgerRangeToCsv(liveRange()).split('\n')
    expect(header).toBe('day,run,block,time,from,to,kwh,credit,seal,prevSeal,sealVerified')
  })

  it('writes the simulated day on every row', () => {
    const rows = ledgerRangeToCsv(liveRange()).split('\n').slice(1)
    expect(rows.every((row) => row.startsWith('4,'))).toBe(true)
  })

  it('leaves run and verdict blank for rows the server has not seen', () => {
    const [, firstRow] = ledgerRangeToCsv(liveRange()).split('\n')
    expect(firstRow.split(',')[1]).toBe('')
    expect(firstRow.split(',').at(-1)).toBe('')
  })

  it('records the server verdict on stored rows', () => {
    const range = buildStoredLedgerRange({
      timeframe: 'all',
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
      days: [],
      totalKwh: 1.05,
      totalCredit: 5.67,
      tradeCount: 1,
      truncated: false,
      sealMismatches: 1,
    })
    const [, row] = ledgerRangeToCsv(range).split('\n')
    expect(row.split(',')[1]).toBe('run-1')
    expect(row.split(',').at(-1)).toBe('false')
  })

  it('writes a header and nothing else for an empty range', () => {
    const empty = buildStoredLedgerRange({
      timeframe: 'all',
      trades: [],
      days: [],
      totalKwh: 0,
      totalCredit: 0,
      tradeCount: 0,
      truncated: false,
      sealMismatches: 0,
    })
    expect(ledgerRangeToCsv(empty).split('\n')).toHaveLength(1)
  })
})

describe('a downloaded file is not a program', () => {
  function rangeWithName(name: string) {
    return buildStoredLedgerRange({
      timeframe: 'all',
      trades: [
        {
          runId: 'run-1',
          simDay: 1,
          blockId: 1,
          clock: '14:20',
          fromName: name,
          toName: 'Abivan',
          kwh: 1,
          credit: 5.5,
          seal: 'seal',
          previousSeal: 'GENESIS',
          sealMatchesClient: true,
        },
      ],
      days: [],
      totalKwh: 1,
      totalCredit: 5.5,
      tradeCount: 1,
      truncated: false,
      sealMismatches: 0,
    })
  }

  it.each(['=1+1', '+1+1', '@SUM(A1)', '-cmd', '\tcalc'])(
    'defuses a name beginning %j',
    (name) => {
      // Names arrive from an unauthenticated endpoint and exports get mailed
      // around. Quoting alone does not help: spreadsheets strip the quotes and
      // then evaluate what is inside.
      const [, row] = ledgerRangeToCsv(rangeWithName(name)).split('\n')
      expect(row).toContain("'" + name)
    },
  )

  it('leaves an ordinary name untouched', () => {
    const [, row] = ledgerRangeToCsv(rangeWithName('Pranav P')).split('\n')
    expect(row).toContain('Pranav P')
    expect(row).not.toContain("'Pranav P")
  })

  it('leaves a negative number alone, so the arithmetic still works', () => {
    // A credit column beginning with a minus is a number, not an attack.
    const csv = ledgerDaysToCsv({
      ...rangeWithName('Pranav P'),
      days: [
        {
          runId: 'run-1',
          simDay: 1,
          dayType: 'cloudy',
          totalKwh: 1,
          totalCredit: -5.5,
          tradeCount: 1,
          rate: -2,
          compromised: false,
          invalidCount: 0,
          open: false,
        },
      ],
    })
    expect(csv).toContain('-5.50')
    expect(csv).not.toContain("'-5.50")
  })
})

describe('ledgerDaysToCsv', () => {
  it('writes one row per simulated day', () => {
    const range = buildLiveLedgerRange({
      timeframe: 'all',
      history: [
        {
          simDay: 1,
          dayType: 'cloudy',
          chain: makeChain(),
          totalKwh: 1,
          totalCredit: 5.5,
          rate: 5.2,
          compromised: true,
          invalidCount: 2,
        },
      ],
      current: {
        simDay: 2,
        dayType: 'heatwave',
        chain: makeChain(),
        totalKwh: 1,
        totalCredit: 5.5,
        rate: 6.1,
        compromised: false,
        invalidCount: 0,
      },
    })

    const lines = ledgerDaysToCsv(range).split('\n')
    expect(lines[0]).toBe('day,run,dayType,trades,kwh,credit,rate,compromised,open')
    expect(lines).toHaveLength(3)
    expect(lines[1]).toContain('cloudy')
    expect(lines[1]).toContain('true')
    expect(lines[2]).toContain('heatwave')
  })
})
