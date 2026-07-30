import { describe, it, expect } from 'vitest'
import { inspectBlock } from '../proofInspector'
import { appendBlock, validateChain, type ChainBlock } from '../hashChain'

function buildChain(length: number): ChainBlock[] {
  const chain: ChainBlock[] = []
  for (let i = 0; i < length; i++) {
    chain.push(
      appendBlock(chain, i + 1, {
        t: `${String(i + 8).padStart(2, '0')}:00`,
        from: `House${i + 1}`,
        to: `House${((i + 1) % length) + 1}`,
        kwh: 0.5 + i * 0.1,
        credit: 3.0 + i * 0.5,
      }),
    )
  }
  return chain
}

describe('inspectBlock', () => {
  it('returns match for an untampered block', () => {
    const chain = buildChain(3)
    const proof = inspectBlock(chain, 1)
    expect(proof.ownHashMatches).toBe(true)
    expect(proof.linkMatches).toBe(true)
    expect(proof.blockId).toBe(2)
  })

  it('returns mismatch for a tampered block', () => {
    const chain = buildChain(3)
    const tampered = chain.map((b) =>
      b.id === 2 ? { ...b, payload: { ...b.payload, kwh: 99.99 }, tampered: true } : b,
    )
    const proof = inspectBlock(tampered, 1)
    expect(proof.ownHashMatches).toBe(false)
  })

  it('detects cascade - block after tampered fails link check', () => {
    const chain = buildChain(4)
    const tampered = chain.map((b) =>
      b.id === 2 ? { ...b, payload: { ...b.payload, kwh: 99.99 }, tampered: true } : b,
    )
    const proofAfter = inspectBlock(tampered, 2)
    expect(proofAfter.linkMatches).toBe(false)
  })

  it('block after tampered fails both own hash and link check (cascade)', () => {
    const chain = buildChain(4)
    const tampered = chain.map((b) =>
      b.id === 2 ? { ...b, payload: { ...b.payload, kwh: 99.99 }, tampered: true } : b,
    )
    const proofAfter = inspectBlock(tampered, 2)
    expect(proofAfter.ownHashMatches).toBe(false)
    expect(proofAfter.linkMatches).toBe(false)
  })

  it('genesis block has GENESIS as prevHash', () => {
    const chain = buildChain(3)
    const proof = inspectBlock(chain, 0)
    expect(proof.storedPrevHash).toBe('GENESIS')
  })

  it('recomputed hash is consistent with validateChain', () => {
    const chain = buildChain(3)
    const { blocks } = validateChain(chain)
    const proof = inspectBlock(chain, 1)
    expect(proof.recomputedHash).toBe(blocks[1].calc)
  })

  it('handles chain with single block', () => {
    const chain = buildChain(1)
    const proof = inspectBlock(chain, 0)
    expect(proof.ownHashMatches).toBe(true)
    expect(proof.linkMatches).toBe(true)
  })
})
