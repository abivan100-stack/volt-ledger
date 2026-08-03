import { create } from 'zustand'
import { createLedgerSlice } from './ledgerSlice'
import { createSimSlice } from './simSlice'
import { createUiSlice } from './uiSlice'
import type { EnergyStoreState } from './types'

export type { EnergyStoreState }
export type { Household } from './types'

export const useEnergyStore = create<EnergyStoreState>()((...a) => ({
  ...createSimSlice(...a),
  ...createLedgerSlice(...a),
  ...createUiSlice(...a),
}))
