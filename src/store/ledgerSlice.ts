import type { StateCreator } from 'zustand'
import { validateChain } from '../lib/hashChain'
import type { EnergyStoreState, LedgerSlice } from './types'

const RESTORED_FLASH_MS = 3000

let restoredFlashTimeout: ReturnType<typeof setTimeout> | undefined

export function clearRestoredFlashTimer(): void {
  clearTimeout(restoredFlashTimeout)
  restoredFlashTimeout = undefined
}

export const createLedgerSlice: StateCreator<EnergyStoreState, [], [], LedgerSlice> = (set, get) => ({
  chain: [],
  ledgerHistory: [],
  nextBlockId: 1,
  totalKwhToday: 0,
  totalCreditToday: 0,
  compromised: false,
  invalidCount: 0,
  restoredFlash: false,

  commitEdit: () => {
    const state = get()
    const id = state.editingBlockId
    if (id == null) return
    const block = state.chain.find((b) => b.id === id)
    const value = parseFloat(state.editValue)
    set({ editingBlockId: null })
    if (!block || !Number.isFinite(value) || value <= 0 || Math.abs(value - block.payload.kwh) < 0.005) return

    const nextKwh = Math.round(value * 100) / 100
    const tamperedChain = state.chain.map((b) =>
      b.id === id ? { ...b, payload: { ...b.payload, kwh: nextKwh }, tampered: true } : b,
    )
    const { blocks, invalidCount } = validateChain(tamperedChain)
    set({ chain: blocks, compromised: invalidCount > 0, invalidCount, restoredFlash: false })
  },

  restoreChain: () => {
    const state = get()
    const restoredChain = state.chain.map((b) =>
      b.tampered ? { ...b, payload: { ...b.payload, kwh: b.origKwh }, tampered: false } : b,
    )
    const { blocks, invalidCount } = validateChain(restoredChain)
    const afterRestore = invalidCount === 0
    set({ chain: blocks, compromised: invalidCount > 0, invalidCount, restoredFlash: afterRestore })
    if (afterRestore) {
      clearRestoredFlashTimer()
      restoredFlashTimeout = setTimeout(() => set({ restoredFlash: false }), RESTORED_FLASH_MS)
    }
  },
})
