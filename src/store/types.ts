import type { DayType } from '../lib/simulation'
import type { GridDependenceBreakdown } from '../lib/gridDependence'
import type { ChainBlock } from '../lib/hashChain'

export interface Household {
  id: number
  name: string
  pv: number
  base: number
  balance: number
  orient: string
  tilt: number
  batt: number
  /** PV commissioning year for prosumers; grid-connection year for pure consumers. */
  since: string
  meter: string
  /** Usable (shade-free, structurally sound) rooftop area in m2, panels installed or not. */
  roofArea: number
  /** TNEB sanctioned load in kW. Caps how much rooftop PV the connection may host. */
  sanctioned: number
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

export interface SimulationConfig {
  simSpeed: number
  startHour: number
  activity: number
}

export interface LedgerArchive {
  simDay: number
  dayType: DayType
  chain: ChainBlock[]
  totalKwh: number
  totalCredit: number
  rate: number
  compromised: boolean
  invalidCount: number
}

export interface SimSlice {
  config: SimulationConfig
  dayType: DayType
  initialized: boolean
  running: boolean
  simDay: number
  simMinute: number
  lastTradeCheckMinute: number
  households: Household[]
  rate: number
  prevRate: number
  rateHistory: number[]
  tickCount: number
  dailyBreakdown: GridDependenceBreakdown
  _tickHandle: ReturnType<typeof setInterval> | null
  _tradeHandle: ReturnType<typeof setInterval> | null

  tick: () => void
  tryTrade: () => void
  setDayType: (dayType: DayType) => void
  setStartHour: (startHour: number) => void
  setSimSpeed: (simSpeed: number) => void
  resetScenario: () => void
  start: () => void
  stop: () => void
}

export interface LedgerSlice {
  chain: ChainBlock[]
  ledgerHistory: LedgerArchive[]
  nextBlockId: number
  totalKwhToday: number
  totalCreditToday: number
  compromised: boolean
  invalidCount: number
  restoredFlash: boolean
  _restoredFlashTimeout: ReturnType<typeof setTimeout> | null

  commitEdit: () => void
  /** Deliberately changes one visible record to demonstrate chain validation. */
  runTamperTest: () => void
  restoreChain: () => void
  clearRestoredFlash: () => void
}

export interface UiSlice {
  selectedHouseIndex: number | null
  editingBlockId: number | null
  editValue: string

  selectHouse: (index: number) => void
  closeDossier: () => void
  startEdit: (id: number) => void
  setEditValue: (value: string) => void
  cancelEdit: () => void
}

export type EnergyStoreState = SimSlice & LedgerSlice & UiSlice
