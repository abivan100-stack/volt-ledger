import { create } from 'zustand'

interface TourState {
  isOpen: boolean
  openTour: () => void
  closeTour: () => void
}

export const useTourStore = create<TourState>((set) => ({
  isOpen: false,
  openTour: () => set({ isOpen: true }),
  closeTour: () => set({ isOpen: false }),
}))
