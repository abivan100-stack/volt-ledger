import { sha256 } from 'js-sha256'

/**
 * Ported verbatim from the original prototype's `sha`/`payloadStr`/
 * `queueBlock`/`validateChain` methods, with the async Web Crypto call
 * replaced by js-sha256's synchronous API per the target stack.
 * Load-bearing — do not modify without an explicitly planned phase.
 */

export interface TradePayload {
  t: string
  from: string
  to: string
  kwh: number
  credit: number
}

export interface ChainBlock {
  id: number
  payload: TradePayload
  origKwh: number
  hash: string
  prevHash: string
  invalid: boolean
  calc: string
  tampered: boolean
}

export const GENESIS_HASH = 'GENESIS'

export function payloadString(payload: TradePayload): string {
  return `${payload.t}|${payload.from}|${payload.to}|${payload.kwh.toFixed(2)}|${payload.credit.toFixed(2)}`
}

export function hashBlock(prevHash: string, payload: TradePayload): string {
  return sha256(prevHash + payloadString(payload))
}

export function appendBlock(chain: ChainBlock[], nextId: number, payload: TradePayload): ChainBlock {
  const prevHash = chain.length ? chain[chain.length - 1].hash : GENESIS_HASH
  const hash = hashBlock(prevHash, payload)
  return {
    id: nextId,
    payload,
    origKwh: payload.kwh,
    hash,
    prevHash,
    invalid: false,
    calc: '',
    tampered: false,
  }
}

export function validateChain(chain: ChainBlock[]): { blocks: ChainBlock[]; invalidCount: number } {
  let prevHash: string = GENESIS_HASH
  let invalidCount = 0
  const blocks = chain.map((block) => {
    const calc = hashBlock(prevHash, block.payload)
    const invalid = calc !== block.hash
    if (invalid) invalidCount += 1
    prevHash = calc
    return { ...block, calc, invalid }
  })
  return { blocks, invalidCount }
}
