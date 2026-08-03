export type ChainStatusVariant = 'compromised' | 'restored' | 'verified'

const HASH_PREVIEW_LENGTH = 10
const HASH_PLACEHOLDER = '·'.repeat(HASH_PREVIEW_LENGTH)

export interface ChainStatusInput {
  compromised: boolean
  restoredFlash: boolean
  invalidCount: number
  chainLength: number
  headHash: string | null
}

export interface ChainStatus {
  variant: ChainStatusVariant
  text: string
}

export function chainStatusFor(input: ChainStatusInput): ChainStatus {
  const { compromised, restoredFlash, invalidCount, chainLength, headHash } = input
  if (compromised) {
    return {
      variant: 'compromised',
      text: `SEAL BROKEN — ${invalidCount} ENTR${invalidCount === 1 ? 'Y' : 'IES'} VOID · SETTLEMENT HALTED`,
    }
  }
  if (restoredFlash) {
    return { variant: 'restored', text: `LEDGER RE-SEALED — ALL ${chainLength} ENTRIES VERIFIED` }
  }
  const head = headHash ? headHash.slice(0, HASH_PREVIEW_LENGTH) : HASH_PLACEHOLDER
  return { variant: 'verified', text: `CHAIN VERIFIED — ${chainLength} ENTRIES · HEAD ${head}` }
}
