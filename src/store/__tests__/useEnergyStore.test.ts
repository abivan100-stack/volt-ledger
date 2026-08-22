import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useEnergyStore } from '../useEnergyStore'
import { MAX_LEDGER_HISTORY_DAYS } from '../simSlice'
import { formatClock } from '../../lib/format'
import { tickHousehold } from '../../lib/simulation'

const TOTAL_DAILY_MINUTES = 24 * 60
const RATE_HISTORY_LENGTH = 44

const pristine = useEnergyStore.getState()

beforeEach(() => {
  useEnergyStore.setState(pristine, true)
})

afterEach(() => {
  useEnergyStore.getState().stop()
})

function sumBreakdown(b: { solarPct: number; batteryPct: number; tradePct: number; gridPct: number }): number {
  return b.solarPct + b.batteryPct + b.tradePct + b.gridPct
}

describe('setDayType', () => {
  it('updates dayType and recomputes household tick fields', () => {
    const before = useEnergyStore.getState()
    useEnergyStore.getState().setDayType('cloudy')
    const state = useEnergyStore.getState()
    expect(state.dayType).toBe('cloudy')
    expect(state.households).not.toBe(before.households)
    expect(state.households).toHaveLength(before.households.length)
    for (const h of state.households) {
      expect(h.out).toBeGreaterThanOrEqual(0)
      expect(h.draw).toBeGreaterThan(0)
      expect(h.net).toBeCloseTo(h.out - h.draw, 10)
    }
  })

  it('recomputes the daily grid dependence breakdown to 100%', () => {
    useEnergyStore.getState().setDayType('heatwave')
    const b = useEnergyStore.getState().dailyBreakdown
    expect(sumBreakdown(b)).toBeCloseTo(100, 5)
  })
})

describe('tick', () => {
  it('advances simMinute by the configured speed and bumps tickCount', () => {
    const speed = useEnergyStore.getState().config.simSpeed
    const before = useEnergyStore.getState()
    useEnergyStore.getState().tick()
    const state = useEnergyStore.getState()
    expect(state.simMinute).toBe(before.simMinute + 2 * speed)
    expect(state.tickCount).toBe(before.tickCount + 1)
    expect(state.rateHistory).toHaveLength(RATE_HISTORY_LENGTH)
  })

  it('keeps a bounded rate history and exposes the historical prevRate', () => {
    useEnergyStore.setState({ simMinute: 12 * 60 })
    const rates: number[] = []
    for (let i = 0; i < 10; i++) {
      useEnergyStore.getState().tick()
      rates.push(useEnergyStore.getState().rate)
    }
    const state = useEnergyStore.getState()
    expect(state.rateHistory).toHaveLength(RATE_HISTORY_LENGTH)
    expect(state.prevRate).toBe(rates[rates.length - 1 - 6])
  })

  it('rolls over at midnight, resetting daily totals and trade tallies', () => {
    useEnergyStore.getState().start()
    useEnergyStore.getState().stop()
    const chainLengthBeforeRollover = useEnergyStore.getState().chain.length
    const speed = useEnergyStore.getState().config.simSpeed
    useEnergyStore.setState({
      simMinute: TOTAL_DAILY_MINUTES - 2 * speed,
      totalKwhToday: 12.5,
      totalCreditToday: 30,
      households: useEnergyStore.getState().households.map((h) => ({
        ...h,
        exp: 3,
        imp: 2,
        earned: 9,
        spent: 6,
        trades: 1,
      })),
    })
    useEnergyStore.getState().tick()
    const state = useEnergyStore.getState()
    expect(state.simMinute).toBe(0)
    expect(state.totalKwhToday).toBe(0)
    expect(state.totalCreditToday).toBe(0)
    expect(chainLengthBeforeRollover).toBeGreaterThan(0)
    expect(state.chain).toEqual([])
    expect(state.ledgerHistory).toHaveLength(1)
    expect(state.ledgerHistory[0]).toMatchObject({
      simDay: 1,
      totalKwh: 12.5,
      totalCredit: 30,
    })
    expect(state.ledgerHistory[0].chain).toHaveLength(chainLengthBeforeRollover)
    expect(state.nextBlockId).toBe(1)
    expect(state.simDay).toBe(2)
    for (const h of state.households) {
      expect(h.exp).toBe(0)
      expect(h.imp).toBe(0)
      expect(h.earned).toBe(0)
      expect(h.spent).toBe(0)
      expect(h.trades).toBe(0)
      expect(h.gen).toBe(0)
      expect(h.con).toBe(0)
    }
  })
})

describe('tryTrade', () => {
  function setUpExporterAndImporter(): { exporterId: number; importerId: number } {
    const state = useEnergyStore.getState()
    const exporter = state.households[0]
    const importer = state.households[3]
    useEnergyStore.setState({
      rate: 6,
      households: state.households.map((h) =>
        h.id === exporter.id ? { ...h, net: 2 } : h.id === importer.id ? { ...h, net: -2 } : h,
      ),
      lastTradeCheckMinute: state.simMinute - 24,
    })
    return { exporterId: exporter.id, importerId: importer.id }
  }

  it('executes a deterministic trade that updates the ledger', () => {
    const before = useEnergyStore.getState()
    const { exporterId, importerId } = setUpExporterAndImporter()
    useEnergyStore.getState().tryTrade()
    const state = useEnergyStore.getState()

    expect(state.chain).toHaveLength(before.chain.length + 1)
    expect(state.nextBlockId).toBe(before.nextBlockId + 1)

    const block = state.chain[state.chain.length - 1]
    expect(block.payload.t).toBe(formatClock(state.simMinute))
    expect(block.payload.kwh).toBeGreaterThan(0)
    expect(block.payload.credit).toBeGreaterThan(0)
    expect(state.totalKwhToday).toBeCloseTo(before.totalKwhToday + block.payload.kwh, 10)
    expect(state.totalCreditToday).toBeCloseTo(before.totalCreditToday + block.payload.credit, 10)

    const from = state.households[exporterId]
    const to = state.households[importerId]
    expect(from.exp).toBeCloseTo(before.households[exporterId].exp + block.payload.kwh, 10)
    expect(from.earned).toBeCloseTo(before.households[exporterId].earned + block.payload.credit, 10)
    expect(from.balance).toBeCloseTo(before.households[exporterId].balance + block.payload.credit, 10)
    expect(from.trades).toBe(before.households[exporterId].trades + 1)
    expect(to.imp).toBeCloseTo(before.households[importerId].imp + block.payload.kwh, 10)
    expect(to.spent).toBeCloseTo(before.households[importerId].spent + block.payload.credit, 10)
    expect(to.balance).toBeCloseTo(before.households[importerId].balance - block.payload.credit, 10)
    expect(to.trades).toBe(before.households[importerId].trades + 1)
  })

  it('keeps only the most recent archived simulated days', () => {
    useEnergyStore.getState().start()
    useEnergyStore.getState().stop()
    const state = useEnergyStore.getState()
    useEnergyStore.setState({
      simMinute: TOTAL_DAILY_MINUTES - 2 * state.config.simSpeed,
      ledgerHistory: Array.from({ length: MAX_LEDGER_HISTORY_DAYS }, (_, index) => ({
        simDay: index + 1,
        dayType: state.dayType,
        chain: [],
        totalKwh: 0,
        totalCredit: 0,
        rate: state.rate,
        compromised: false,
        invalidCount: 0,
      })),
    })

    useEnergyStore.getState().tick()

    expect(useEnergyStore.getState().ledgerHistory).toHaveLength(MAX_LEDGER_HISTORY_DAYS)
    expect(useEnergyStore.getState().ledgerHistory[0]?.simDay).toBe(2)
  })

  it('caps traded energy by both parties\' simulated interval capacity', () => {
    const state = useEnergyStore.getState()
    useEnergyStore.setState({
      households: state.households.map((h) =>
        h.id === 0 ? { ...h, net: 0.21 } : h.id === 3 ? { ...h, net: -0.11 } : { ...h, net: 0 },
      ),
      lastTradeCheckMinute: state.simMinute - 24,
    })

    useEnergyStore.getState().tryTrade()
    const block = useEnergyStore.getState().chain.at(-1)
    expect(block?.payload.kwh).toBeLessThanOrEqual(0.05)
  })

  it('uses elapsed simulated time rather than the current speed to cap a trade', () => {
    const state = useEnergyStore.getState()
    useEnergyStore.setState({
      simMinute: 504,
      lastTradeCheckMinute: 480,
      households: state.households.map((h) =>
        h.id === 0 ? { ...h, net: 0.21 } : h.id === 3 ? { ...h, net: -0.11 } : { ...h, net: 0 },
      ),
    })
    useEnergyStore.getState().setSimSpeed(8)
    useEnergyStore.getState().tryTrade()

    expect(useEnergyStore.getState().chain.at(-1)?.payload.kwh).toBeLessThanOrEqual(0.04)
  })

  it('does nothing when the chain is compromised', () => {
    const { exporterId, importerId } = setUpExporterAndImporter()
    useEnergyStore.setState({ compromised: true })
    const before = useEnergyStore.getState()
    useEnergyStore.getState().tryTrade()
    const state = useEnergyStore.getState()
    expect(state.chain).toHaveLength(before.chain.length)
    expect(state.households[exporterId].trades).toBe(before.households[exporterId].trades)
    expect(state.households[importerId].trades).toBe(before.households[importerId].trades)
  })

  it('does nothing without both an exporter and an importer', () => {
    const before = useEnergyStore.getState()
    useEnergyStore.getState().tryTrade()
    const state = useEnergyStore.getState()
    expect(state.chain).toHaveLength(before.chain.length)
    expect(state.nextBlockId).toBe(before.nextBlockId)
  })
})

describe('start and stop', () => {
  it('starts a midnight scenario without previous-day seed entries', () => {
    useEnergyStore.setState((state) => ({ config: { ...state.config, startHour: 0 } }))
    useEnergyStore.getState().start()
    useEnergyStore.getState().stop()

    const state = useEnergyStore.getState()
    expect(state.simMinute).toBe(0)
    expect(state.chain).toEqual([])
    expect(state.totalKwhToday).toBe(0)
  })

  it('accepts only configured simulation speeds', () => {
    useEnergyStore.getState().setSimSpeed(8)
    expect(useEnergyStore.getState().config.simSpeed).toBe(8)
    useEnergyStore.getState().setSimSpeed(3)
    expect(useEnergyStore.getState().config.simSpeed).toBe(8)
  })

  it('resets the current scenario, clearing transient ledger and UI state', () => {
    useEnergyStore.getState().start()
    useEnergyStore.getState().stop()
    useEnergyStore.setState({ compromised: true, invalidCount: 4, selectedHouseIndex: 2, editingBlockId: 1, editValue: '9.99' })

    useEnergyStore.getState().resetScenario()
    const state = useEnergyStore.getState()
    expect(state.compromised).toBe(false)
    expect(state.invalidCount).toBe(0)
    expect(state.selectedHouseIndex).toBeNull()
    expect(state.editingBlockId).toBeNull()
    expect(state.editValue).toBe('')
    expect(state.simDay).toBe(1)
    expect(state.ledgerHistory).toEqual([])
    expect(state.chain.length).toBeGreaterThan(0)
  })

  it('start seeds the chain exactly once and begins running', () => {
    useEnergyStore.getState().start()
    let state = useEnergyStore.getState()
    expect(state.initialized).toBe(true)
    expect(state.running).toBe(true)
    expect(state.simMinute).toBe(8 * 60)
    expect(state.chain.length).toBeGreaterThan(0)
    expect(state.nextBlockId).toBe(state.chain.length + 1)
    expect(state.totalKwhToday).toBeGreaterThan(0)
    expect(state.totalCreditToday).toBeGreaterThan(0)
    for (const block of state.chain) {
      const [hour, minute] = block.payload.t.split(':').map(Number)
      const tradeMinute = hour * 60 + minute
      const from = state.households.find((household) => household.name === block.payload.from)!
      const to = state.households.find((household) => household.name === block.payload.to)!
      const availableKwh = Math.min(
        Math.max(0, tickHousehold(from.pv, from.base, from.id, tradeMinute, state.dayType).net),
        Math.max(0, -tickHousehold(to.pv, to.base, to.id, tradeMinute, state.dayType).net),
      ) * (5 / 60)
      expect(block.payload.kwh).toBeLessThanOrEqual(availableKwh)
    }

    useEnergyStore.getState().stop()
    useEnergyStore.setState({ running: false })
    useEnergyStore.getState().start()
    state = useEnergyStore.getState()
    expect(state.chain.length).toBeGreaterThan(0)
    expect(state.nextBlockId).toBe(state.chain.length + 1)
  })

  it('stop clears the running flag', () => {
    useEnergyStore.getState().start()
    useEnergyStore.getState().stop()
    expect(useEnergyStore.getState().running).toBe(false)
  })
})

describe('commitEdit and restoreChain', () => {
  function tamperBlock(): { targetId: number; origKwh: number } {
    useEnergyStore.getState().start()
    useEnergyStore.getState().stop()
    const state = useEnergyStore.getState()
    const target = state.chain[3]
    useEnergyStore.getState().startEdit(target.id)
    useEnergyStore.getState().setEditValue('9.99')
    useEnergyStore.getState().commitEdit()
    return { targetId: target.id, origKwh: target.payload.kwh }
  }

  it('tampering a block marks it and compromises the chain', () => {
    const { targetId } = tamperBlock()
    const state = useEnergyStore.getState()
    expect(state.editingBlockId).toBeNull()
    const edited = state.chain.find((b) => b.id === targetId)
    expect(edited?.tampered).toBe(true)
    expect(edited?.payload.kwh).toBe(9.99)
    expect(state.compromised).toBe(true)
    expect(state.invalidCount).toBeGreaterThan(0)
    expect(state.restoredFlash).toBe(false)
  })

  it('restoring the chain clears the compromise', () => {
    const { targetId, origKwh } = tamperBlock()
    useEnergyStore.getState().restoreChain()
    const state = useEnergyStore.getState()
    expect(state.compromised).toBe(false)
    expect(state.invalidCount).toBe(0)
    expect(state.restoredFlash).toBe(true)
    const restored = state.chain.find((b) => b.id === targetId)
    expect(restored?.tampered).toBe(false)
    expect(restored?.payload.kwh).toBe(origKwh)
  })

  it('commitEdit is a no-op without an active edit', () => {
    const before = useEnergyStore.getState()
    useEnergyStore.getState().commitEdit()
    const state = useEnergyStore.getState()
    expect(state.chain).toBe(before.chain)
    expect(state.compromised).toBe(false)
  })

  it('commitEdit ignores non-numeric, non-positive, or unchanged values', () => {
    useEnergyStore.getState().start()
    useEnergyStore.getState().stop()
    const target = useEnergyStore.getState().chain[0]

    useEnergyStore.getState().startEdit(target.id)
    useEnergyStore.getState().setEditValue('abc')
    useEnergyStore.getState().commitEdit()
    expect(useEnergyStore.getState().chain[0].tampered).toBe(false)

    useEnergyStore.getState().startEdit(target.id)
    useEnergyStore.getState().setEditValue('0')
    useEnergyStore.getState().commitEdit()
    expect(useEnergyStore.getState().chain[0].tampered).toBe(false)

    useEnergyStore.getState().startEdit(target.id)
    useEnergyStore.getState().setEditValue('Infinity')
    useEnergyStore.getState().commitEdit()
    expect(useEnergyStore.getState().chain[0].tampered).toBe(false)

    useEnergyStore.getState().startEdit(target.id)
    useEnergyStore.getState().setEditValue(target.payload.kwh.toFixed(2))
    useEnergyStore.getState().commitEdit()
    expect(useEnergyStore.getState().chain[0].tampered).toBe(false)
    expect(useEnergyStore.getState().editingBlockId).toBeNull()
  })
})

describe('dossier UI state', () => {
  it('selectHouse and closeDossier manage the selection', () => {
    expect(useEnergyStore.getState().selectedHouseIndex).toBeNull()
    useEnergyStore.getState().selectHouse(2)
    expect(useEnergyStore.getState().selectedHouseIndex).toBe(2)
    useEnergyStore.getState().closeDossier()
    expect(useEnergyStore.getState().selectedHouseIndex).toBeNull()
  })

  it('startEdit pre-fills the edit value and cancelEdit clears it', () => {
    useEnergyStore.getState().start()
    useEnergyStore.getState().stop()
    const target = useEnergyStore.getState().chain[0]

    useEnergyStore.getState().startEdit(target.id)
    const state = useEnergyStore.getState()
    expect(state.editingBlockId).toBe(target.id)
    expect(state.editValue).toBe(target.payload.kwh.toFixed(2))

    useEnergyStore.getState().cancelEdit()
    expect(useEnergyStore.getState().editingBlockId).toBeNull()
  })

  it('startEdit is a no-op for an unknown block id', () => {
    useEnergyStore.getState().startEdit(9999)
    expect(useEnergyStore.getState().editingBlockId).toBeNull()
  })

  it('setEditValue updates the draft without committing', () => {
    useEnergyStore.getState().setEditValue('1.25')
    expect(useEnergyStore.getState().editValue).toBe('1.25')
    expect(useEnergyStore.getState().editingBlockId).toBeNull()
  })
})
