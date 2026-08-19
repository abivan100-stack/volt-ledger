import type { StateCreator } from 'zustand'
import { formatClock } from '../lib/format'
import {
  integrateGenerationAndConsumption,
  nextCommunityRate,
  RATE_BASE,
  seededUnit,
  tickHousehold,
  type DayType,
} from '../lib/simulation'
import { appendBlock, type ChainBlock } from '../lib/hashChain'
import { dailyGridDependence } from '../lib/gridDependence'
import { clearRestoredFlashTimer } from './ledgerSlice'
import type { EnergyStoreState, Household, SimSlice } from './types'

const TICK_INTERVAL_MS = 1000
const TRADE_INTERVAL_MS = 3200
const TOTAL_DAILY_MINUTES = 24 * 60
const MINUTES_PER_TICK_UNIT = 2
const RATE_HISTORY_LENGTH = 44
const PREV_RATE_OFFSET = 6
const INITIAL_RATE = RATE_BASE
const TRADE_EXPORT_THRESHOLD = 0.2
const TRADE_IMPORT_THRESHOLD = -0.1
const TRADE_FROM_SALT = 2
const TRADE_TO_SALT = 3
const TRADE_KWH_SALT = 5
const TRADE_KWH_MIN = 0.25
const TRADE_KWH_RANGE = 1.15
const SEED_KWH_MIN = 0.3
const SEED_KWH_RANGE = 1.1
const SEED_KWH_SALT = 101
const SEED_RATE_MIN = 5.3
const SEED_RATE_RANGE = 0.5
const SEED_RATE_SALT = 103
const SEED_INTERVAL_MINUTES = 5

export const SIM_SPEEDS = [1, 2, 4, 8] as const

type HouseholdSeed = Omit<
  Household,
  'id' | 'out' | 'draw' | 'net' | 'gen' | 'con' | 'exp' | 'imp' | 'earned' | 'spent' | 'trades'
>

type TradeSide = 'seller' | 'buyer'

function applyTrade(h: Household, side: TradeSide, kwh: number, credit: number): Household {
  if (side === 'seller') {
    return { ...h, balance: h.balance + credit, exp: h.exp + kwh, earned: h.earned + credit, trades: h.trades + 1 }
  }
  return { ...h, balance: h.balance - credit, imp: h.imp + kwh, spent: h.spent + credit, trades: h.trades + 1 }
}

// Ported verbatim from the original prototype's `this.houses` constructor data.
const RAW_HOUSEHOLDS: HouseholdSeed[] = [
  { name: 'Nikil Sundaram', pv: 4.2, base: 0.6, balance: 1240.4, orient: 'South-south-west', tilt: 12, batt: 5.0, since: '2021', meter: 'NB-0417' },
  { name: 'Prem Ramesh', pv: 3.0, base: 0.5, balance: 312.75, orient: 'South', tilt: 10, batt: 0, since: '2022', meter: 'NB-1183' },
  { name: 'Pranav P', pv: 5.4, base: 0.9, balance: 2105.1, orient: 'South', tilt: 15, batt: 10.0, since: '2020', meter: 'NB-0952' },
  { name: 'Abivan', pv: 0, base: 0.7, balance: -484.2, orient: '—', tilt: 0, batt: 0, since: '—', meter: 'NB-2261' },
  { name: 'Karthik Iyer', pv: 2.2, base: 0.4, balance: 96.3, orient: 'West', tilt: 12, batt: 0, since: '2023', meter: 'NB-1546' },
  { name: 'Deepak Krishnan', pv: 3.6, base: 1.1, balance: -152.6, orient: 'South-east', tilt: 10, batt: 5.0, since: '2021', meter: 'NB-0788' },
  { name: 'Sanjay Murugan', pv: 4.8, base: 0.8, balance: 878.05, orient: 'South', tilt: 14, batt: 7.5, since: '2022', meter: 'NB-0333' },
  { name: 'Rahul Natarajan', pv: 0, base: 0.9, balance: -691.4, orient: '—', tilt: 0, batt: 0, since: '—', meter: 'NB-2490' },
  { name: 'Aravind Chandran', pv: 2.8, base: 0.5, balance: 204.15, orient: 'South-south-east', tilt: 11, batt: 0, since: '2023', meter: 'NB-1902' },
  { name: 'Surya Selvaraj', pv: 3.9, base: 1.0, balance: -58.9, orient: 'South-west', tilt: 13, batt: 5.0, since: '2022', meter: 'NB-0641' },
]

export const HOUSEHOLD_COUNT = RAW_HOUSEHOLDS.length

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
  dayType: DayType,
): { households: Household[]; chain: ChainBlock[]; nextBlockId: number; totalKwh: number; totalCredit: number } {
  let nextHouseholds = households
  let chain: ChainBlock[] = []
  let nextBlockId = 1
  let totalKwh = 0
  let totalCredit = 0
  for (let i = 0; i < SEED_OFFSETS_MINUTES.length; i++) {
    if (SEED_OFFSETS_MINUTES[i] > startMinute) continue
    const [fromIndex, toIndex] = SEED_PAIRS[i]
    const from = nextHouseholds[fromIndex]
    const to = nextHouseholds[toIndex]
    const tradeMinute = startMinute - SEED_OFFSETS_MINUTES[i]
    const fromNet = tickHousehold(from.pv, from.base, from.id, tradeMinute, dayType).net
    const toNet = tickHousehold(to.pv, to.base, to.id, tradeMinute, dayType).net
    const availableKwh = Math.min(Math.max(0, fromNet), Math.max(0, -toNet)) * (SEED_INTERVAL_MINUTES / 60)
    const requestedKwh = SEED_KWH_MIN + seededUnit(i * SEED_KWH_SALT) * SEED_KWH_RANGE
    const kwh = Math.floor(Math.min(requestedKwh, availableKwh) * 100) / 100
    if (kwh <= 0) continue
    const credit = Math.round(kwh * (SEED_RATE_MIN + seededUnit(i * SEED_RATE_SALT) * SEED_RATE_RANGE) * 100) / 100
    nextHouseholds = nextHouseholds.map((h, index) => {
      if (index === fromIndex) return applyTrade(h, 'seller', kwh, credit)
      if (index === toIndex) return applyTrade(h, 'buyer', kwh, credit)
      return h
    })
    const block = appendBlock(chain, nextBlockId, {
      t: formatClock(tradeMinute),
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

function initialScenario(dayType: DayType, startHour: number) {
  const startMinute = startHour * 60
  const households = createInitialHouseholds().map((household) => ({
    ...household,
    ...tickHousehold(household.pv, household.base, household.id, startMinute, dayType),
    ...integrateGenerationAndConsumption(household.pv, household.base, household.id, dayType, startMinute),
  }))
  const seeded = seedChain(households, startMinute, dayType)
  return {
    simMinute: startMinute,
    lastTradeCheckMinute: startMinute,
    households: seeded.households,
    chain: seeded.chain,
    nextBlockId: seeded.nextBlockId,
    totalKwhToday: seeded.totalKwh,
    totalCreditToday: seeded.totalCredit,
    dailyBreakdown: dailyGridDependence(seeded.households, dayType),
  }
}

let tickHandle: ReturnType<typeof setInterval> | undefined
let tradeHandle: ReturnType<typeof setInterval> | undefined

export const createSimSlice: StateCreator<EnergyStoreState, [], [], SimSlice> = (set, get) => ({
  config: { simSpeed: 4, startHour: 8, activity: 1 },
  dayType: 'sunny-weekday',
  initialized: false,
  running: false,
  simDay: 1,
  simMinute: 8 * 60,
  lastTradeCheckMinute: 8 * 60,
  households: createInitialHouseholds(),
  rate: INITIAL_RATE,
  prevRate: INITIAL_RATE,
  rateHistory: new Array(RATE_HISTORY_LENGTH).fill(INITIAL_RATE),
  tickCount: 0,
  dailyBreakdown: dailyGridDependence(createInitialHouseholds(), 'sunny-weekday'),

  setDayType: (dayType: DayType) => {
    const state = get()
    if (state.dayType === dayType) return
    set({ dayType })
    get().resetScenario()
  },

  setSimSpeed: (simSpeed: number) => {
    if (!(SIM_SPEEDS as readonly number[]).includes(simSpeed)) return
    set((state) => ({ config: { ...state.config, simSpeed } }))
  },

  resetScenario: () => {
    const state = get()
    const wasRunning = state.running
    if (wasRunning) state.stop()
    clearRestoredFlashTimer()
    const scenario = initialScenario(state.dayType, state.config.startHour)
    set({
      ...scenario,
      initialized: true,
      running: false,
      simDay: 1,
      rate: INITIAL_RATE,
      prevRate: INITIAL_RATE,
      rateHistory: new Array(RATE_HISTORY_LENGTH).fill(INITIAL_RATE),
      tickCount: 0,
      ledgerHistory: [],
      compromised: false,
      invalidCount: 0,
      restoredFlash: false,
      selectedHouseIndex: null,
      editingBlockId: null,
      editValue: '',
    })
    if (wasRunning) get().start()
  },

  start: () => {
    const state = get()
    if (!state.initialized) {
      set({
        ...initialScenario(state.dayType, state.config.startHour),
        initialized: true,
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
    clearRestoredFlashTimer()
    tickHandle = undefined
    tradeHandle = undefined
    set({ running: false })
  },

  tick: () => {
    const state = get()
    const dayType = state.dayType
    const prevMinute = state.simMinute
    let simMinute = prevMinute + MINUTES_PER_TICK_UNIT * state.config.simSpeed
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

    set({
      simMinute,
      households,
      rate,
      prevRate,
      rateHistory,
      totalKwhToday,
      totalCreditToday,
      tickCount,
      ...(rolled
        ? {
            chain: [],
            ledgerHistory: state.chain.length
              ? [...state.ledgerHistory, {
                  simDay: state.simDay,
                  dayType: state.dayType,
                  chain: state.chain,
                  totalKwh: state.totalKwhToday,
                  totalCredit: state.totalCreditToday,
                  rate: state.rate,
                  compromised: state.compromised,
                  invalidCount: state.invalidCount,
                }]
              : state.ledgerHistory,
            nextBlockId: 1,
            compromised: false,
            invalidCount: 0,
            restoredFlash: false,
            simDay: state.simDay + 1,
            lastTradeCheckMinute: simMinute,
          }
        : {}),
    })
  },

  tryTrade: () => {
    const state = get()
    const elapsedMinutes = (state.simMinute - state.lastTradeCheckMinute + TOTAL_DAILY_MINUTES) % TOTAL_DAILY_MINUTES
    set({ lastTradeCheckMinute: state.simMinute })
    if (state.compromised) return
    const exporters = state.households.filter((h) => h.net > TRADE_EXPORT_THRESHOLD)
    const importers = state.households.filter((h) => h.net < TRADE_IMPORT_THRESHOLD)
    if (!exporters.length || !importers.length) return
    const tradeSeed = state.nextBlockId
    const from = exporters[Math.floor(seededUnit(tradeSeed, TRADE_FROM_SALT) * exporters.length)]
    const to = importers[Math.floor(seededUnit(tradeSeed, TRADE_TO_SALT) * importers.length)]
    const simulatedHours = elapsedMinutes / 60
    const availableKwh = Math.min(from.net, -to.net) * simulatedHours
    const requestedKwh = TRADE_KWH_MIN + seededUnit(tradeSeed, TRADE_KWH_SALT) * TRADE_KWH_RANGE
    const kwh = Math.floor(Math.min(requestedKwh, availableKwh) * 100) / 100
    if (kwh <= 0) return
    const credit = Math.round(kwh * state.rate * 100) / 100

    const households = state.households.map((h) => {
      if (h === from) return applyTrade(h, 'seller', kwh, credit)
      if (h === to) return applyTrade(h, 'buyer', kwh, credit)
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
})
