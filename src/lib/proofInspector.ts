import { hashBlock, GENESIS_HASH, type ChainBlock } from './hashChain'

/**
 * Live proof for one block: recomputes SHA-256 from genesis forward, right
 * now, from `hashChain.ts` — never reads `block.invalid`/`block.calc`
 * (those come from the store's own `validateChain` pass) or any other
 * precomputed field. Two independent checks:
 *
 * - `ownHashMatches`: does this block's stored hash still match
 *   SHA-256(the chain's true hash just before it + this block's current
 *   payload)? Fails the instant a block's own payload is tampered.
 * - `linkMatches`: does this block's stored `prevHash` pointer still equal
 *   the block before it's true (recomputed) hash? A tampered block's own
 *   hash never gets rewritten, so this fails for every block *after* the
 *   tampered one — the cascade.
 */
export interface BlockProof {
  blockId: number
  storedHash: string
  recomputedHash: string
  storedPrevHash: string
  previousRecomputedHash: string
  ownHashMatches: boolean
  linkMatches: boolean
}

/** Recomputes the chain's true hash immediately before `chain[index]`, from genesis, live. */
function recomputeHashBefore(chain: ChainBlock[], index: number): string {
  let hash = GENESIS_HASH
  for (let i = 0; i < index; i++) {
    hash = hashBlock(hash, chain[i].payload)
  }
  return hash
}

export function inspectBlock(chain: ChainBlock[], index: number): BlockProof {
  if (index < 0 || index >= chain.length) throw new RangeError('inspectBlock index out of bounds')
  const block = chain[index]
  const previousRecomputedHash = recomputeHashBefore(chain, index)
  const recomputedHash = hashBlock(previousRecomputedHash, block.payload)

  return {
    blockId: block.id,
    storedHash: block.hash,
    recomputedHash,
    storedPrevHash: block.prevHash,
    previousRecomputedHash,
    ownHashMatches: recomputedHash === block.hash,
    linkMatches: previousRecomputedHash === block.prevHash,
  }
}
