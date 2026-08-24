import { create } from 'zustand'

export interface TourStep {
  id: string
  number: number
  title: string
  subtitle: string
  sectionId: string
  route: string
  durationSec: number
  keyPoints: string[]
  badge: string
  actionLabel?: string
  actionType?: 'tamper' | 'speed' | 'solar'
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'p2p-microgrid',
    number: 1,
    title: 'Decentralized P2P Energy Simulation',
    subtitle: 'Real-time solar microgrid self-balancing across prosumer households.',
    sectionId: 'network',
    route: '/',
    durationSec: 10,
    badge: 'Microgrid Core',
    keyPoints: [
      'Deterministic PV solar generation and consumption curve integration',
      'Continuous automated peer-to-peer energy matching and local grid relief',
      'Dynamic community tariff calculated dynamically based on instantaneous supply/demand',
    ],
  },
  {
    id: 'hash-chain',
    number: 2,
    title: 'Cryptographic SHA-256 Hash Chain',
    subtitle: 'Every kWh transferred is sealed with cryptographic hash linking back to genesis.',
    sectionId: 'ledger',
    route: '/ledger',
    durationSec: 10,
    badge: 'Zero Trust',
    keyPoints: [
      'Synchronous js-sha256 block sealing for every P2P energy transaction',
      'Immutable provenance tying timestamp, buyer, seller, and kWh volume',
      'Cryptographic genesis block verification prevents transaction replay attacks',
    ],
  },
  {
    id: 'tamper-detection',
    number: 3,
    title: 'Real-Time Tamper Invalidation & Resilience',
    subtitle: 'Live attack demonstration showing instant downstream zero-trust invalidation.',
    sectionId: 'ledger',
    route: '/ledger',
    durationSec: 10,
    badge: 'Cryptographic Security',
    keyPoints: [
      'Even a 0.01 kWh manual modification breaks the cryptographic digest',
      'Cascading downstream block invalidation visually flags malicious alterations',
      'Self-healing genesis verification enables one-click recovery',
    ],
    actionLabel: 'Trigger Tamper Attack Demo',
    actionType: 'tamper',
  },
  {
    id: 'proof-settlement',
    number: 4,
    title: 'Proof Inspector & Dynamic Settlement',
    subtitle: 'Zero-knowledge verification, double-spend prevention, and fair automated tariff.',
    sectionId: 'proof',
    route: '/ledger/settlement',
    durationSec: 10,
    badge: 'Consensus & Audit',
    keyPoints: [
      'Independent cryptographic proof audit engine inspecting block validity',
      'Gini fairness coefficient ensures equitable tariff distribution',
      'Automated daily and hourly settlement without centralized intermediaries',
    ],
  },
  {
    id: 'multi-tenant-rbac',
    number: 5,
    title: 'Multi-Tenant Organisations & RBAC',
    subtitle: 'Enterprise-ready multi-tenant ledger with audit trails, RBAC, and secure tokens.',
    sectionId: 'account',
    route: '/account',
    durationSec: 10,
    badge: 'Enterprise Architecture',
    keyPoints: [
      'Multi-tenant workspace isolation for different microgrids and housing societies',
      'Fine-grained RBAC: Owner, Admin, Auditor, and Member roles',
      'Cryptographic invitation flow with token expiry and replay protection',
    ],
  },
  {
    id: 'carbon-autonomy',
    number: 6,
    title: 'Carbon Offset & Energy Autonomy Impact',
    subtitle: 'Real-time environmental and community independence metrics.',
    sectionId: 'impact',
    route: '/',
    durationSec: 10,
    badge: 'Sustainability ROI',
    keyPoints: [
      'Real-time metric calculating kg CO₂ displaced vs coal-heavy grid baselines',
      'Calculated equivalent trees planted and environmental credit score',
      'Grid independence meter quantifying neighborhood energy sovereignty',
    ],
  },
]

export const TOTAL_TOUR_SECONDS = TOUR_STEPS.reduce((acc, step) => acc + step.durationSec, 0)

export interface TourState {
  isActive: boolean
  isPaused: boolean
  currentStepIndex: number
  stepRemainingSec: number
  totalRemainingSec: number

  startTour: () => void
  stopTour: () => void
  pauseTour: () => void
  resumeTour: () => void
  nextStep: () => void
  prevStep: () => void
  goToStep: (index: number) => void
  tickSecond: () => void
}

export const useTourStore = create<TourState>()((set, get) => ({
  isActive: false,
  isPaused: false,
  currentStepIndex: 0,
  stepRemainingSec: TOUR_STEPS[0].durationSec,
  totalRemainingSec: TOTAL_TOUR_SECONDS,

  startTour: () => {
    set({
      isActive: true,
      isPaused: false,
      currentStepIndex: 0,
      stepRemainingSec: TOUR_STEPS[0].durationSec,
      totalRemainingSec: TOTAL_TOUR_SECONDS,
    })
  },

  stopTour: () => {
    set({
      isActive: false,
      isPaused: false,
      currentStepIndex: 0,
      stepRemainingSec: TOUR_STEPS[0].durationSec,
      totalRemainingSec: TOTAL_TOUR_SECONDS,
    })
  },

  pauseTour: () => {
    set({ isPaused: true })
  },

  resumeTour: () => {
    set({ isPaused: false })
  },

  nextStep: () => {
    const { currentStepIndex } = get()
    if (currentStepIndex < TOUR_STEPS.length - 1) {
      const nextIdx = currentStepIndex + 1
      const remainingSecs = TOUR_STEPS.slice(nextIdx).reduce((acc, s) => acc + s.durationSec, 0)
      set({
        currentStepIndex: nextIdx,
        stepRemainingSec: TOUR_STEPS[nextIdx].durationSec,
        totalRemainingSec: remainingSecs,
      })
    } else {
      get().stopTour()
    }
  },

  prevStep: () => {
    const { currentStepIndex } = get()
    if (currentStepIndex > 0) {
      const prevIdx = currentStepIndex - 1
      const remainingSecs = TOUR_STEPS.slice(prevIdx).reduce((acc, s) => acc + s.durationSec, 0)
      set({
        currentStepIndex: prevIdx,
        stepRemainingSec: TOUR_STEPS[prevIdx].durationSec,
        totalRemainingSec: remainingSecs,
      })
    }
  },

  goToStep: (index: number) => {
    if (index >= 0 && index < TOUR_STEPS.length) {
      const remainingSecs = TOUR_STEPS.slice(index).reduce((acc, s) => acc + s.durationSec, 0)
      set({
        currentStepIndex: index,
        stepRemainingSec: TOUR_STEPS[index].durationSec,
        totalRemainingSec: remainingSecs,
      })
    }
  },

  tickSecond: () => {
    const { isActive, isPaused, stepRemainingSec, totalRemainingSec, currentStepIndex } = get()
    if (!isActive || isPaused) return

    if (totalRemainingSec <= 1) {
      get().stopTour()
      return
    }

    if (stepRemainingSec <= 1) {
      if (currentStepIndex < TOUR_STEPS.length - 1) {
        const nextIdx = currentStepIndex + 1
        set({
          currentStepIndex: nextIdx,
          stepRemainingSec: TOUR_STEPS[nextIdx].durationSec,
          totalRemainingSec: totalRemainingSec - 1,
        })
      } else {
        get().stopTour()
      }
    } else {
      set({
        stepRemainingSec: stepRemainingSec - 1,
        totalRemainingSec: totalRemainingSec - 1,
      })
    }
  },
}))
