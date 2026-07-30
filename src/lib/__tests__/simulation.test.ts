import { describe, it, expect } from 'vitest'
import {
  solarCurve,
  demandCurve,
  tickHousehold,
  nextCommunityRate,
  integrateGenerationAndConsumption,
} from '../simulation'

describe('solarCurve', () => {
  it('returns 0 before hour 6', () => {
    expect(solarCurve(0, 'sunny-weekday')).toBe(0)
    expect(solarCurve(3, 'sunny-weekday')).toBe(0)
    expect(solarCurve(5.99, 'sunny-weekday')).toBe(0)
  })

  it('returns 0 after hour 18.5', () => {
    expect(solarCurve(19, 'sunny-weekday')).toBe(0)
    expect(solarCurve(23, 'sunny-weekday')).toBe(0)
  })

  it('returns > 0 during daylight hours', () => {
    const noon = solarCurve(12, 'sunny-weekday')
    expect(noon).toBeGreaterThan(0)
    expect(noon).toBeLessThanOrEqual(1)
  })

  it('peaks around noon', () => {
    const values = [9, 10, 11, 12, 13, 14, 15].map((h) => solarCurve(h, 'sunny-weekday'))
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThanOrEqual(0)
    }
  })

  it('cloudy reduces output', () => {
    for (let h = 6; h <= 18; h++) {
      const sunny = solarCurve(h, 'sunny-weekday')
      const cloudy = solarCurve(h, 'cloudy')
      if (sunny > 0) {
        expect(cloudy).toBeLessThan(sunny)
        expect(cloudy).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('cloudy returns shape * 0.45', () => {
    const sunny_12 = solarCurve(12, 'sunny-weekday')
    const cloudy_12 = solarCurve(12, 'cloudy')
    expect(Math.abs(cloudy_12 - sunny_12 * 0.45)).toBeLessThan(0.001)
  })

  it('heatwave increases output', () => {
    for (let h = 8; h <= 16; h++) {
      const sunny = solarCurve(h, 'sunny-weekday')
      const heat = solarCurve(h, 'heatwave')
      if (sunny > 0) {
        expect(heat).toBeGreaterThan(sunny)
      }
    }
  })

  it('heatwave returns shape * 1.08', () => {
    const sunny_12 = solarCurve(12, 'sunny-weekday')
    const heat_12 = solarCurve(12, 'heatwave')
    expect(Math.abs(heat_12 - sunny_12 * 1.08)).toBeLessThan(0.001)
  })
})

describe('demandCurve', () => {
  const household = { id: 0, base: 0.6 }

  it('returns a positive value for all hours', () => {
    for (let h = 0; h < 24; h++) {
      const d = demandCurve(h, household, 'sunny-weekday')
      expect(d).toBeGreaterThan(0)
    }
  })

  it('is deterministic - same inputs produce same result', () => {
    const a = demandCurve(14, household, 'sunny-weekday')
    const b = demandCurve(14, household, 'sunny-weekday')
    expect(a).toBe(b)
  })

  it('varies by hour', () => {
    const morning = demandCurve(7, household, 'sunny-weekday')
    const evening = demandCurve(20, household, 'sunny-weekday')
    expect(morning).not.toBe(evening)
  })

  it('varies by household id', () => {
    const hh1 = demandCurve(14, { id: 1, base: 0.6 }, 'sunny-weekday')
    const hh2 = demandCurve(14, { id: 2, base: 0.6 }, 'sunny-weekday')
    expect(hh1).not.toBe(hh2)
  })

  it('scales with base load', () => {
    const small = demandCurve(14, { id: 0, base: 0.5 }, 'sunny-weekday')
    const large = demandCurve(14, { id: 0, base: 1.0 }, 'sunny-weekday')
    expect(large).toBeGreaterThan(small)
  })
})

describe('tickHousehold', () => {
  it('returns expected fields', () => {
    const result = tickHousehold(4.2, 0.6, 0, 720, 'sunny-weekday')
    expect(result).toHaveProperty('out')
    expect(result).toHaveProperty('draw')
    expect(result).toHaveProperty('net')
    expect(result.net).toBeCloseTo(result.out - result.draw, 10)
  })

  it('is deterministic', () => {
    const a = tickHousehold(4.2, 0.6, 0, 720, 'sunny-weekday')
    const b = tickHousehold(4.2, 0.6, 0, 720, 'sunny-weekday')
    expect(a.out).toBe(b.out)
    expect(a.draw).toBe(b.draw)
    expect(a.net).toBe(b.net)
  })

  it('produces positive net during midday for high-PV households', () => {
    const result = tickHousehold(5.0, 0.3, 0, 720, 'sunny-weekday')
    expect(result.out).toBeGreaterThan(0)
  })

  it('produces negative net at night', () => {
    const result = tickHousehold(5.0, 0.3, 0, 0, 'sunny-weekday')
    expect(result.net).toBeLessThan(0)
  })

  it('out is never negative', () => {
    for (let m = 0; m < 1440; m += 60) {
      const result = tickHousehold(4.2, 0.6, 0, m, 'sunny-weekday')
      expect(result.out).toBeGreaterThanOrEqual(0)
    }
  })

  it('draw is always positive', () => {
    for (let m = 0; m < 1440; m += 60) {
      const result = tickHousehold(4.2, 0.6, 0, m, 'sunny-weekday')
      expect(result.draw).toBeGreaterThan(0)
    }
  })
})

describe('integrateGenerationAndConsumption', () => {
  it('returns gen and con', () => {
    const result = integrateGenerationAndConsumption(4.2, 0.6, 0, 'sunny-weekday', 720)
    expect(result).toHaveProperty('gen')
    expect(result).toHaveProperty('con')
    expect(result.gen).toBeGreaterThanOrEqual(0)
    expect(result.con).toBeGreaterThan(0)
  })

  it('is deterministic', () => {
    const a = integrateGenerationAndConsumption(4.2, 0.6, 0, 'sunny-weekday', 720)
    const b = integrateGenerationAndConsumption(4.2, 0.6, 0, 'sunny-weekday', 720)
    expect(a.gen).toBe(b.gen)
    expect(a.con).toBe(b.con)
  })

  it('zero pv produces zero gen', () => {
    const result = integrateGenerationAndConsumption(0, 0.6, 0, 'sunny-weekday', 720)
    expect(result.gen).toBe(0)
  })

  it('increases gen with uptoMinute', () => {
    const early = integrateGenerationAndConsumption(4.2, 0.6, 0, 'sunny-weekday', 360)
    const late = integrateGenerationAndConsumption(4.2, 0.6, 0, 'sunny-weekday', 720)
    expect(late.gen).toBeGreaterThanOrEqual(early.gen)
  })

  it('zero uptoMinute returns zero values', () => {
    const result = integrateGenerationAndConsumption(4.2, 0.6, 0, 'sunny-weekday', 0)
    expect(result.gen).toBe(0)
    expect(result.con).toBe(0)
  })
})

describe('nextCommunityRate', () => {
  it('stays within [4.4, 7.2] bounds', () => {
    for (let i = 0; i < 100; i++) {
      const rate = nextCommunityRate(5.5, Math.random() * 10, Math.random() * 10, i)
      expect(rate).toBeGreaterThanOrEqual(4.4)
      expect(rate).toBeLessThanOrEqual(7.2)
    }
  })

  it('increases when demand exceeds supply', () => {
    const rate = nextCommunityRate(5.5, 3, 8, 0)
    expect(rate).toBeGreaterThan(5.5)
  })

  it('decreases when supply exceeds demand', () => {
    const rate = nextCommunityRate(5.5, 8, 3, 0)
    expect(rate).toBeLessThan(5.5)
  })

  it('converges toward target when supply far exceeds demand', () => {
    const rate = nextCommunityRate(5.5, 20, 1, 0)
    expect(rate).toBeGreaterThanOrEqual(4.4)
    expect(rate).toBeLessThan(5.5)
  })

  it('converges toward target when demand far exceeds supply', () => {
    const rate = nextCommunityRate(5.5, 1, 20, 0)
    expect(rate).toBeLessThanOrEqual(7.2)
    expect(rate).toBeGreaterThan(5.5)
  })
})
