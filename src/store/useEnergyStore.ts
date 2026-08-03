import { create } from 'zustand'
import { formatClock } from '../lib/format'
import {
  integrateGenerationAndConsumption,
  nextCommunityRate,
  seededUnit,
  tickHousehold,
  type DayType,
} from '../lib/simulation'
import { appendBlock, validateChain, type ChainBlock } from '../lib/hashChain'
import { dailyGridDependence, type GridDependenceBreakdown } from '../lib/gridDependence'

const TICK_INTERVAL_MS = 1000
const TRADE_INTERVAL_MS = 3200
const TOTAL_DAILY_MINUTES = 24 * 60
const RATE_HISTORY_LENGTH = 44
const PREV_RATE_OFFSET = 6
const INITIAL_RATE = 5.5
const TRADE_EXPORT_THRESHOLD = 0.2
const TRADE_IMPORT_THRESHOLD = -0.1

export interface Household {
  id: number
  name: string
  pv: number
  base: number
  balance: number
  orient: string
  tilt: number
  batt: number
  since: string
  meter: string
  out: number
  draw: number
  net: number
  gen: number
  con: number
  exp: number
  imp: number
  earned: number
  spent: number
  trades: number
}

interface SimulationConfig {
  simSpeed: number
  startHour: number
  activity: number
}

interface EnergyStoreState {
  config: SimulationConfig
  dayType: DayType
  initialized: boolean
  running: boolean
  simMinute: number
  households: Household[]
  chain: ChainBlock[]
  nextBlockId: number
  totalKwhToday: number
  totalCreditToday: number
  rate: number
  prevRate: number
  rateHistory: number[]
  tickCount: number
  selectedHouseIndex: number | null
  compromised: boolean
  invalidCount: number
  restoredFlash: boolean
  editingBlockId: number | null
  editValue: string
  dailyBreakdown: GridDependenceBreakdown

  start: () => void
  stop: () => void
  tick: () => void
  tryTrade: () => void
  setDayType: (dayType: DayType) => void
  selectHouse: (index: number) => void
  closeDossier: () => void
  startEdit: (id: number) => void
  setEditValue: (value: string) => void
  cancelEdit: () => void
  commitEdit: () => void
  restoreChain: () => void
}

type HouseholdSeed = Omit<
  Household,
  'id' | 'out' | 'draw' | 'net' | 'gen' | 'con' | 'exp' | 'imp' | 'earned' | 'spent' | 'trades'
>

// Ported verbatim from the original prototype's `this.houses` constructor data.
const RAW_HOUSEHOLDS: HouseholdSeed[] = [
  { name: 'Nikil Sundaram', pv: 4.2, base: 0.6, balance: 1240.4, orient: 'South-south-west', tilt: 12, batt: 5.0, since: '2021', meter: 'NB-0417' },
  { name: 'Prem Ramesh', pv: 3.0, base: 0.5, balance: 312.75, orient: 'South', tilt: 10, batt: 0, since: '2022', meter: 'NB-1183' },
  { name: 'Pranav P', pv: 5.4, base: 0.9, balance: 2105.1, orient: 'South', tilt: 15, batt: 10.0, since: '2020', meter: 'NB-0952' },
  { name: 'Vijay', pv: 0, base: 0.7, balance: -484.2, orient: '—', tilt: 0, batt: 0, since: '—', meter: 'NB-2261' },
  { name: 'Karthik Iyer', pv: 2.2, base: 0.4, balance: 96.3, orient: 'West', tilt: 12, batt: 0, since: '2023', meter: 'NB-1546' },
  { name: 'Deepak Krishnan', pv: 3.6, base: 1.1, balance: -152.6, orient: 'South-east', tilt: 10, batt: 5.0, since: '2021', meter: 'NB-0788' },
  { name: 'Sanjay Murugan', pv: 4.8, base: 0.8, balance: 878.05, orient: 'South', tilt: 14, batt: 7.5, since: '2022', meter: 'NB-0333' },
  { name: 'Rahul Natarajan', pv: 0, base: 0.9, balance: -691.4, orient: '—', tilt: 0, batt: 0, since: '—', meter: 'NB-2490' },
  { name: 'Aravind Chandran', pv: 2.8, base: 0.5, balance: 204.15, orient: 'South-south-east', tilt: 11, batt: 0, since: '2023', meter: 'NB-1902' },
  { name: 'Surya Selvaraj', pv: 3.9, base: 1.0, balance: -58.9, orient: 'South-west', tilt: 13, batt: 5.0, since: '2022', meter: 'NB-0641' },
]

function createInitialHouseholds(): Household[] {
  return RAW_HOUSEHOLDS.map((seed, id) => ({
    ...seed,
    id,
    out: 0,
    draw: 0,
    net: 0,
    gen: 0,
    con: 0,
    exp: 0,
    imp: 0,
    earned: 0,
    spent: 0,
    trades: 0,
  }))
}

// Ported verbatim from the original prototype's `seedChain` method.
const SEED_OFFSETS_MINUTES = [42, 37, 32, 27, 22, 17, 12, 7, 3]
const SEED_PAIRS: Array<[number, number]> = [
  [2, 3], [0, 7], [6, 3], [8, 7], [2, 9], [4, 3], [9, 7], [0, 3], [6, 1],
]

function seedChain(
  households: Household[],
  startMinute: number,
): { households: Household[]; chain: ChainBlock[]; nextBlockId: number; totalKwh: number; totalCredit: number } {
  let nextHouseholds = households
  let chain: ChainBlock[] = []
  let nextBlockId = 1
  let totalKwh = 0
  let totalCredit = 0
  for (let i = 0; i < SEED_OFFSETS_MINUTES.length; i++) {
    const [fromIndex, toIndex] = SEED_PAIRS[i]
    const from = nextHouseholds[fromIndex]
    const to = nextHouseholds[toIndex]
    const kwh = Math.round((0.3 + seededUnit(i * 101) * 1.1) * 100) / 100
    const credit = Math.round(kwh * (5.3 + seededUnit(i * 103) * 0.5) * 100) / 100
    nextHouseholds = nextHouseholds.map((h, index) => {
      if (index === fromIndex) {
        return { ...h, balance: h.balance + credit, exp: h.exp + kwh, earned: h.earned + credit, trades: h.trades + 1 }
      }
      if (index === toIndex) {
        return { ...h, balance: h.balance - credit, imp: h.imp + kwh, spent: h.spent + credit, trades: h.trades + 1 }
      }
      return h
    })
    const block = appendBlock(chain, nextBlockId, {
      t: formatClock(startMinute - SEED_OFFSETS_MINUTES[i]),
      from: from.name,
      to: to.name,
      kwh,
      credit,
    })
    chain = [...chain, block]
    nextBlockId += 1
    totalKwh += kwh
    totalCredit += credit
  }
  return { households: nextHouseholds, chain, nextBlockId, totalKwh, totalCredit }
}

export const useEnergyStore = create<EnergyStoreState>((set, get) => {
  let tickHandle: ReturnType<typeof setInterval> | undefined
  let tradeHandle: ReturnType<typeof setInterval> | undefined
  let restoredFlashTimeout: ReturnType<typeof setTimeout> | undefined

  return {
  config: { simSpeed: 4, startHour: 8, activity: 1 },
  dayType: 'sunny-weekday',
  initialized: false,
  running: false,
  simMinute: 8 * 60,
  households: createInitialHouseholds(),
  chain: [],
  nextBlockId: 1,
  totalKwhToday: 0,
  totalCreditToday: 0,
  rate: INITIAL_RATE,
  prevRate: INITIAL_RATE,
  rateHistory: new Array(RATE_HISTORY_LENGTH).fill(INITIAL_RATE),
  tickCount: 0,
  selectedHouseIndex: null,
  compromised: false,
  invalidCount: 0,
  restoredFlash: false,
  editingBlockId: null,
  editValue: '',
  dailyBreakdown: dailyGridDependence(createInitialHouseholds(), 'sunny-weekday'),

  selectHouse: (index: number) => set({ selectedHouseIndex: index }),
  closeDossier: () => set({ selectedHouseIndex: null }),

  startEdit: (id: number) => {
    const block = get().chain.find((b) => b.id === id)
    if (!block) return
    set({ editingBlockId: id, editValue: block.payload.kwh.toFixed(2) })
  },

  setEditValue: (value: string) => set({ editValue: value }),

  cancelEdit: () => set({ editingBlockId: null }),

  commitEdit: () => {
    const state = get()
    const id = state.editingBlockId
    if (id == null) return
    const block = state.chain.find((b) => b.id === id)
    const value = parseFloat(state.editValue)
    set({ editingBlockId: null })
    if (!block || Number.isNaN(value) || value <= 0 || Math.abs(value - block.payload.kwh) < 0.005) return

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
      clearTimeout(restoredFlashTimeout)
      restoredFlashTimeout = setTimeout(() => set({ restoredFlash: false }), 3000)
    }
  },

  setDayType: (dayType: DayType) => {
    const state = get()
    const households = state.households.map((h) => {
      const { out, draw, net } = tickHousehold(h.pv, h.base, h.id, state.simMinute, dayType)
      const { gen, con } = integrateGenerationAndConsumption(h.pv, h.base, h.id, dayType, state.simMinute)
      return { ...h, out, draw, net, gen, con }
    })
    const dailyBreakdown = dailyGridDependence(households, dayType)
    set({ dayType, households, dailyBreakdown })
  },

  start: () => {
    const state = get()
    if (!state.initialized) {
      const startMinute = state.config.startHour * 60
      const withDailyStats = state.households.map((h) => ({
        ...h,
        ...integrateGenerationAndConsumption(h.pv, h.base, h.id, state.dayType, startMinute),
      }))
      const seeded = seedChain(withDailyStats, startMinute)
      set({
        initialized: true,
        simMinute: startMinute,
        households: seeded.households,
        chain: seeded.chain,
        nextBlockId: seeded.nextBlockId,
        totalKwhToday: seeded.totalKwh,
        totalCreditToday: seeded.totalCredit,
        dailyBreakdown: dailyGridDependence(seeded.households, state.dayType),
      })
    }
    if (!get().running) {
      tickHandle = setInterval(() => get().tick(), TICK_INTERVAL_MS)
      tradeHandle = setInterval(() => get().tryTrade(), TRADE_INTERVAL_MS)
      set({ running: true })
    }
  },

  stop: () => {
    if (tickHandle !== undefined) clearInterval(tickHandle)
    if (tradeHandle !== undefined) clearInterval(tradeHandle)
    clearTimeout(restoredFlashTimeout)
    tickHandle = undefined
    tradeHandle = undefined
    restoredFlashTimeout = undefined
    set({ running: false })
  },

  tick: () => {
    const state = get()
    const dayType = state.dayType
    const prevMinute = state.simMinute
    let simMinute = prevMinute + 2 * state.config.simSpeed
    let rolled = false
    if (simMinute >= TOTAL_DAILY_MINUTES) {
      simMinute -= TOTAL_DAILY_MINUTES
      rolled = true
    }
    const dtHours = rolled ? 0 : (simMinute - prevMinute) / 60

    let supply = 0
    let demand = 0
    let households = state.households.map((h) => {
      const { out, draw, net } = tickHousehold(h.pv, h.base, h.id, simMinute, dayType)
      supply += Math.max(0, net)
      demand += Math.max(0, -net)
      return { ...h, out, draw, net, gen: h.gen + out * dtHours, con: h.con + draw * dtHours }
    })

    const tickCount = state.tickCount + 1
    const rate = nextCommunityRate(state.rate, supply, demand, tickCount)
    const prevRate = state.rateHistory[state.rateHistory.length - PREV_RATE_OFFSET] ?? state.rate
    const rateHistory = [...state.rateHistory, rate].slice(-RATE_HISTORY_LENGTH)

    let totalKwhToday = state.totalKwhToday
    let totalCreditToday = state.totalCreditToday

    if (rolled) {
      households = households.map((h) => ({
        ...h,
        ...integrateGenerationAndConsumption(h.pv, h.base, h.id, dayType, simMinute),
        exp: 0,
        imp: 0,
        earned: 0,
        spent: 0,
        trades: 0,
      }))
      totalKwhToday = 0
      totalCreditToday = 0
    }

    set({ simMinute, households, rate, prevRate, rateHistory, totalKwhToday, totalCreditToday, tickCount })
  },

  tryTrade: () => {
    const state = get()
    if (state.compromised) return
    const exporters = state.households.filter((h) => h.net > TRADE_EXPORT_THRESHOLD)
    const importers = state.households.filter((h) => h.net < TRADE_IMPORT_THRESHOLD)
    if (!exporters.length || !importers.length) return
    const tradeSeed = state.nextBlockId
    const from = exporters[Math.floor(seededUnit(tradeSeed, 2) * exporters.length)]
    const to = importers[Math.floor(seededUnit(tradeSeed, 3) * importers.length)]
    const kwh = Math.round(Math.min(0.25 + seededUnit(tradeSeed, 5) * 1.15, Math.max(0.2, from.net)) * 100) / 100
    const credit = Math.round(kwh * state.rate * 100) / 100

    const households = state.households.map((h) => {
      if (h === from) {
        return { ...h, balance: h.balance + credit, exp: h.exp + kwh, earned: h.earned + credit, trades: h.trades + 1 }
      }
      if (h === to) {
        return { ...h, balance: h.balance - credit, imp: h.imp + kwh, spent: h.spent + credit, trades: h.trades + 1 }
      }
      return h
    })

    const block = appendBlock(state.chain, state.nextBlockId, {
      t: formatClock(state.simMinute),
      from: from.name,
      to: to.name,
      kwh,
      credit,
    })

    set({
      households,
      chain: [...state.chain, block],
      nextBlockId: state.nextBlockId + 1,
      totalKwhToday: state.totalKwhToday + kwh,
      totalCreditToday: state.totalCreditToday + credit,
    })
  },
}})
