import type { StateCreator } from 'zustand'
import type { EnergyStoreState, UiSlice } from './types'

export const createUiSlice: StateCreator<EnergyStoreState, [], [], UiSlice> = (set, get) => ({
  selectedHouseIndex: null,
  editingBlockId: null,
  editValue: '',

  selectHouse: (index: number) => set({ selectedHouseIndex: index }),

  closeDossier: () => set({ selectedHouseIndex: null }),

  startEdit: (id: number) => {
    const block = get().chain.find((b) => b.id === id)
    if (!block) return
    set({ editingBlockId: id, editValue: block.payload.kwh.toFixed(2) })
  },

  setEditValue: (value: string) => set({ editValue: value }),

  cancelEdit: () => set({ editingBlockId: null }),
})
