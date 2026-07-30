import { describe, it, expect } from 'vitest'
import { sha256 } from 'js-sha256'
import {
  payloadString,
  hashBlock,
  appendBlock,
  validateChain,
  GENESIS_HASH,
  type ChainBlock,
  type TradePayload,
} from '../hashChain'

function makePayload(overrides: Partial<TradePayload> = {}): TradePayload {
  return {
    t: '08:42',
    from: 'Alice',
    to: 'Bob',
    kwh: 1.23,
    credit: 7.38,
    ...overrides,
  }
}

function makeBlock(id: number, payload: TradePayload, prevHash: string): ChainBlock {
  const hash = hashBlock(prevHash, payload)
  return {
    id,
    payload,
    origKwh: payload.kwh,
    hash,
    prevHash,
    invalid: false,
    calc: '',
    tampered: false,
  }
}

describe('payloadString', () => {
  it('formats all fields pipe-delimited', () => {
    const result = payloadString(makePayload())
    expect(result).toBe('08:42|Alice|Bob|1.23|7.38')
  })

  it('formats kWh with two decimals', () => {
    const result = payloadString(makePayload({ kwh: 2 }))
    expect(result).toBe('08:42|Alice|Bob|2.00|7.38')
  })

  it('formats credit with two decimals', () => {
    const result = payloadString(makePayload({ credit: 10 }))
    expect(result).toBe('08:42|Alice|Bob|1.23|10.00')
  })
})

describe('hashBlock', () => {
  it('returns the same hash for the same inputs', () => {
    const payload = makePayload()
    const a = hashBlock(GENESIS_HASH, payload)
    const b = hashBlock(GENESIS_HASH, payload)
    expect(a).toBe(b)
  })

  it('produces different hashes for different payloads', () => {
    const a = hashBlock(GENESIS_HASH, makePayload({ kwh: 1.0 }))
    const b = hashBlock(GENESIS_HASH, makePayload({ kwh: 2.0 }))
    expect(a).not.toBe(b)
  })

  it('produces different hashes for different prevHashes', () => {
    const payload = makePayload()
    const a = hashBlock(GENESIS_HASH, payload)
    const b = hashBlock('OTHER_GENESIS', payload)
    expect(a).not.toBe(b)
  })

  it('computes sha256 of prevHash + payloadString', () => {
    const payload = makePayload()
    const prevHash = GENESIS_HASH
    const expected = sha256(prevHash + payloadString(payload))
    expect(hashBlock(prevHash, payload)).toBe(expected)
  })
})

describe('appendBlock', () => {
  it('uses GENESIS_HASH as prevHash on empty chain', () => {
    const payload = makePayload()
    const block = appendBlock([], 1, payload)
    expect(block.prevHash).toBe(GENESIS_HASH)
    expect(block.id).toBe(1)
    expect(block.hash).toBe(hashBlock(GENESIS_HASH, payload))
    expect(block.origKwh).toBe(payload.kwh)
    expect(block.invalid).toBe(false)
    expect(block.tampered).toBe(false)
  })

  it('chains from the last block in a non-empty chain', () => {
    const existing = [makeBlock(1, makePayload({ kwh: 1 }), GENESIS_HASH)]
    const payload = makePayload({ kwh: 2 })
    const block = appendBlock(existing, 2, payload)
    expect(block.prevHash).toBe(existing[0].hash)
    expect(block.hash).toBe(hashBlock(existing[0].hash, payload))
    expect(block.id).toBe(2)
  })

  it('increments id correctly', () => {
    const existing = [makeBlock(1, makePayload(), GENESIS_HASH)]
    const block = appendBlock(existing, 42, makePayload())
    expect(block.id).toBe(42)
  })
})

describe('validateChain', () => {
  it('returns all blocks valid on an untampered chain', () => {
    const chain: ChainBlock[] = []
    for (let i = 0; i < 3; i++) {
      chain.push(appendBlock(chain, i + 1, makePayload({ kwh: i + 1 })))
    }
    const { blocks, invalidCount } = validateChain(chain)
    expect(invalidCount).toBe(0)
    for (const block of blocks) {
      expect(block.invalid).toBe(false)
      expect(block.calc).toBe(block.hash)
    }
  })

  it('detects a tampered single block', () => {
    let chain: ChainBlock[] = []
    for (let i = 0; i < 3; i++) {
      chain.push(appendBlock(chain, i + 1, makePayload({ kwh: i + 1 })))
    }
    const tampered = chain.map((b) =>
      b.id === 2 ? { ...b, payload: { ...b.payload, kwh: 99.99 }, tampered: true } : b,
    )
    const { blocks, invalidCount } = validateChain(tampered)
    expect(invalidCount).toBeGreaterThanOrEqual(1)
    expect(blocks.find((b) => b.id === 2)?.invalid).toBe(true)
  })

  it('detects cascade after tampered block', () => {
    const chain: ChainBlock[] = []
    for (let i = 0; i < 4; i++) {
      chain.push(appendBlock(chain, i + 1, makePayload({ kwh: i + 1 })))
    }
    const tampered = chain.map((b) =>
      b.id === 2 ? { ...b, payload: { ...b.payload, kwh: 99.99 }, tampered: true } : b,
    )
    const { blocks, invalidCount } = validateChain(tampered)
    expect(invalidCount).toBe(3)
    expect(blocks.find((b) => b.id === 2)?.invalid).toBe(true)
    expect(blocks.find((b) => b.id === 3)?.invalid).toBe(true)
    expect(blocks.find((b) => b.id === 4)?.invalid).toBe(true)
  })

  it('only invalidates the last block when only the last block is tampered', () => {
    const chain: ChainBlock[] = []
    for (let i = 0; i < 4; i++) {
      chain.push(appendBlock(chain, i + 1, makePayload({ kwh: i + 1 })))
    }
    const tampered = chain.map((b) =>
      b.id === 4 ? { ...b, payload: { ...b.payload, kwh: 99.99 }, tampered: true } : b,
    )
    const { blocks, invalidCount } = validateChain(tampered)
    expect(invalidCount).toBe(1)
    expect(blocks.find((b) => b.id === 4)?.invalid).toBe(true)
    expect(blocks.find((b) => b.id === 3)?.invalid).toBe(false)
  })

  it('restore makes the chain valid again', () => {
    const chain: ChainBlock[] = []
    for (let i = 0; i < 3; i++) {
      chain.push(appendBlock(chain, i + 1, makePayload({ kwh: i + 1 })))
    }
    const tampered = chain.map((b) =>
      b.id === 2 ? { ...b, payload: { ...b.payload, kwh: 99.99, from: b.payload.from, to: b.payload.to, t: b.payload.t, credit: b.payload.credit }, tampered: true } : b,
    )
    const restored = tampered.map((b) =>
      b.tampered ? { ...b, payload: { ...b.payload, kwh: b.origKwh }, tampered: false } : b,
    )
    const { blocks, invalidCount } = validateChain(restored)
    expect(invalidCount).toBe(0)
    for (const block of blocks) {
      expect(block.invalid).toBe(false)
    }
  })

  it('returns 0 invalidCount for empty chain', () => {
    const { blocks, invalidCount } = validateChain([])
    expect(invalidCount).toBe(0)
    expect(blocks).toEqual([])
  })

  it('populates calc field for every block', () => {
    const chain = [appendBlock([], 1, makePayload())]
    const { blocks } = validateChain(chain)
    expect(blocks[0].calc).toBe(blocks[0].hash)
  })

  it('handles tampered genesis block', () => {
    const chain = [appendBlock([], 1, makePayload())]
    const tampered = chain.map((b) =>
      b.id === 1 ? { ...b, payload: { ...b.payload, kwh: 0.5 }, tampered: true } : b,
    )
    const { blocks, invalidCount } = validateChain(tampered)
    expect(invalidCount).toBe(1)
    expect(blocks[0].invalid).toBe(true)
  })
})
