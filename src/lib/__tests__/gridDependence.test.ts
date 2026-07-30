import { describe, it, expect } from 'vitest'
import {
  hourlyGridDependence,
  dailyGridDependence,
  autonomyPct,
  type GridDependenceHousehold,
} from '../gridDependence'

const ALL_SOLAR_OFF: GridDependenceHousehold[] = [
  { id: 0, pv: 0, base: 0.6, batt: 0 },
  { id: 1, pv: 0, base: 0.5, batt: 0 },
]

const MIXED: GridDependenceHousehold[] = [
  { id: 0, pv: 4.2, base: 0.6, batt: 5.0 },
  { id: 1, pv: 3.0, base: 0.5, batt: 0 },
  { id: 2, pv: 0, base: 0.7, batt: 0 },
]

function expectSumsTo100(breakdown: { solarPct: number; batteryPct: number; tradePct: number; gridPct: number }) {
  const sum = breakdown.solarPct + breakdown.batteryPct + breakdown.tradePct + breakdown.gridPct
  expect(Math.abs(sum - 100)).toBeLessThan(0.1)
}

describe('hourlyGridDependence', () => {
  it('returns all grid at night for PV-only households', () => {
    const result = hourlyGridDependence(ALL_SOLAR_OFF, 2, 'sunny-weekday')
    expectSumsTo100(result)
    expect(result.gridPct).toBeGreaterThan(90)
    expect(result.solarPct).toBeLessThan(1)
  })

  it('includes solar during daytime', () => {
    const result = hourlyGridDependence(MIXED, 12, 'sunny-weekday')
    expectSumsTo100(result)
    expect(result.solarPct).toBeGreaterThan(0)
  })

  it('hourly breakdown includes solar during daytime', () => {
    const result = hourlyGridDependence(MIXED, 12, 'sunny-weekday')
    expect(result.solarPct).toBeGreaterThan(0)
    expectSumsTo100(result)
  })

  it('hourly breakdown is all grid at night for households without battery', () => {
    const result = hourlyGridDependence(ALL_SOLAR_OFF, 2, 'sunny-weekday')
    expect(result.gridPct).toBeCloseTo(100, 0)
    expect(result.solarPct).toBeCloseTo(0, 0)
    expectSumsTo100(result)
  })

  it('always sums to 100%', () => {
    for (const h of [0, 6, 12, 18]) {
      const result = hourlyGridDependence(MIXED, h, 'sunny-weekday')
      expectSumsTo100(result)
    }
  })
})

describe('dailyGridDependence', () => {
  it('returns mostly grid for households with no solar', () => {
    const result = dailyGridDependence(ALL_SOLAR_OFF, 'sunny-weekday')
    expectSumsTo100(result)
    expect(result.gridPct).toBeGreaterThan(90)
  })

  it('reduces grid dependence with solar', () => {
    const result = dailyGridDependence(MIXED, 'sunny-weekday')
    expectSumsTo100(result)
    expect(result.gridPct).toBeLessThan(100)
    expect(result.solarPct).toBeGreaterThan(0)
  })

  it('is deterministic', () => {
    const a = dailyGridDependence(MIXED, 'sunny-weekday')
    const b = dailyGridDependence(MIXED, 'sunny-weekday')
    expect(a.solarPct).toBe(b.solarPct)
    expect(a.gridPct).toBe(b.gridPct)
    expect(a.tradePct).toBe(b.tradePct)
    expect(a.batteryPct).toBe(b.batteryPct)
  })

  it('always sums to 100%', () => {
    const result = dailyGridDependence(MIXED, 'sunny-weekday')
    expectSumsTo100(result)
  })
})

describe('autonomyPct', () => {
  it('returns 100 - gridPct', () => {
    expect(autonomyPct({ solarPct: 30, batteryPct: 10, tradePct: 15, gridPct: 45 })).toBe(55)
  })

  it('returns 100 when gridPct is 0', () => {
    expect(autonomyPct({ solarPct: 70, batteryPct: 20, tradePct: 10, gridPct: 0 })).toBe(100)
  })

  it('returns 0 when gridPct is 100', () => {
    expect(autonomyPct({ solarPct: 0, batteryPct: 0, tradePct: 0, gridPct: 100 })).toBe(0)
  })
})
