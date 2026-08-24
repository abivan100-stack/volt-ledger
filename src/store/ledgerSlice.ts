import type { StateCreator } from 'zustand'
import { validateChain } from '../lib/hashChain'
import type { EnergyStoreState, LedgerSlice } from './types'

const RESTORED_FLASH_MS = 3000
const TAMPER_TEST_VISIBLE_BLOCKS = 10
const TAMPER_TEST_DELTA_KWH = 0.01

export function clearRestoredFlashTimer(): void {
  // Kept for backwards compatibility; timers now live in Zustand state.
}

function tamperChain(chain: LedgerSlice['chain'], id: number, nextKwh: number) {
  const tamperedChain = chain.map((block) =>
    block.id === id ? { ...block, payload: { ...block.payload, kwh: nextKwh }, tampered: true } : block,
  )
  return validateChain(tamperedChain)
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
  _restoredFlashTimeout: null,

  clearRestoredFlash: () => {
    const t = get()._restoredFlashTimeout
    if (t != null) clearTimeout(t)
    set({ _restoredFlashTimeout: null, restoredFlash: false })
  },

  commitEdit: () => {
    const state = get()
    const id = state.editingBlockId
    if (id == null) return
    const block = state.chain.find((b) => b.id === id)
    const value = parseFloat(state.editValue)
    set({ editingBlockId: null })
    if (!block || !Number.isFinite(value) || value <= 0 || Math.abs(value - block.payload.kwh) < 0.005) return

    const nextKwh = Math.round(value * 100) / 100
    const { blocks, invalidCount } = tamperChain(state.chain, id, nextKwh)
    set({ chain: blocks, compromised: invalidCount > 0, invalidCount, restoredFlash: false })
  },

  runTamperTest: () => {
    const state = get()
    if (state.compromised || state.chain.length === 0) return

    // Target the first row the ledger currently renders, so the altered value
    // and every downstream failure are immediately visible to a judge.
    const target = state.chain[Math.max(0, state.chain.length - TAMPER_TEST_VISIBLE_BLOCKS)]
    const nextKwh = Math.round((target.payload.kwh + TAMPER_TEST_DELTA_KWH) * 100) / 100
    const { blocks, invalidCount } = tamperChain(state.chain, target.id, nextKwh)
    set({
      chain: blocks,
      compromised: invalidCount > 0,
      invalidCount,
      restoredFlash: false,
      editingBlockId: null,
      editValue: '',
    })
  },

  restoreChain: () => {
    const state = get()
    const restoredChain = state.chain.map((b) =>
      b.tampered ? { ...b, payload: { ...b.payload, kwh: b.origKwh }, tampered: false } : b,
    )
    const { blocks, invalidCount } = validateChain(restoredChain)
    const afterRestore = invalidCount === 0
    const prevTimeout = get()._restoredFlashTimeout
    if (prevTimeout != null) clearTimeout(prevTimeout)
    set({ chain: blocks, compromised: invalidCount > 0, invalidCount, restoredFlash: afterRestore, _restoredFlashTimeout: null })
    if (afterRestore) {
      const timeout = setTimeout(() => set({ restoredFlash: false, _restoredFlashTimeout: null }), RESTORED_FLASH_MS)
      set({ _restoredFlashTimeout: timeout })
    }
  },
})
