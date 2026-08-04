import { describe, it, expect } from 'vitest'
import { appendBlock, type ChainBlock } from '../hashChain'
import { chainToCsv, chainToJson } from '../chainExport'

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

describe('chainToJson', () => {
  it('round-trips the verifier-relevant fields for every block', () => {
    const chain = makeChain()
    const parsed = JSON.parse(chainToJson(chain))
    expect(parsed).toHaveLength(2)
    expect(parsed[0]).toEqual({
      id: chain[0].id,
      time: chain[0].payload.t,
      from: chain[0].payload.from,
      to: chain[0].payload.to,
      kwh: chain[0].payload.kwh,
      credit: chain[0].payload.credit,
      hash: chain[0].hash,
      prevHash: chain[0].prevHash,
    })
  })

  it('omits UI-only fields', () => {
    const parsed = JSON.parse(chainToJson(makeChain()))
    for (const block of parsed) {
      expect(block).not.toHaveProperty('invalid')
      expect(block).not.toHaveProperty('calc')
      expect(block).not.toHaveProperty('tampered')
      expect(block).not.toHaveProperty('origKwh')
    }
  })

  it('emits an empty array for an empty chain', () => {
    expect(chainToJson([])).toBe('[]')
  })
})
