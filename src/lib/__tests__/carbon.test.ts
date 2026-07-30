import { describe, it, expect } from 'vitest'
import { carbonAvoidedKg, carAvoidedKm, GRID_EMISSIONS_FACTOR_KG_PER_KWH, CAR_EMISSIONS_KG_PER_KM } from '../carbon'

describe('carbonAvoidedKg', () => {
  it('returns zero for zero kWh', () => {
    expect(carbonAvoidedKg(0)).toBe(0)
  })

  it('multiplies by grid emissions factor', () => {
    expect(carbonAvoidedKg(1)).toBe(GRID_EMISSIONS_FACTOR_KG_PER_KWH)
  })

  it('scales linearly', () => {
    const a = carbonAvoidedKg(10)
    const b = carbonAvoidedKg(20)
    expect(b).toBeCloseTo(a * 2, 10)
  })

  it('handles fractional kWh', () => {
    const result = carbonAvoidedKg(0.5)
    expect(result).toBe(0.5 * GRID_EMISSIONS_FACTOR_KG_PER_KWH)
  })
})

describe('carAvoidedKm', () => {
  it('returns zero for zero CO2', () => {
    expect(carAvoidedKm(0)).toBe(0)
  })

  it('divides by car emissions factor', () => {
    expect(carAvoidedKm(CAR_EMISSIONS_KG_PER_KM)).toBe(1)
  })

  it('scales linearly', () => {
    const a = carAvoidedKm(1.2)
    const b = carAvoidedKm(2.4)
    expect(b).toBeCloseTo(a * 2, 10)
  })
})
