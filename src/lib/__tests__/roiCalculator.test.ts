import { describe, expect, it } from 'vitest'
import {
  calculateCommunityRoi,
  calculateSuryaGharSubsidy,
  type RoiCalculatorInput,
} from '../roiCalculator'

describe('calculateSuryaGharSubsidy', () => {
  it('returns 0 for zero or negative kW', () => {
    expect(calculateSuryaGharSubsidy(0)).toBe(0)
    expect(calculateSuryaGharSubsidy(-1)).toBe(0)
  })

  it('returns ₹30,000 for systems under 1.5 kW', () => {
    expect(calculateSuryaGharSubsidy(1.0)).toBe(30_000)
    expect(calculateSuryaGharSubsidy(1.4)).toBe(30_000)
  })

  it('returns ₹60,000 for systems between 1.5 kW and 2.5 kW', () => {
    expect(calculateSuryaGharSubsidy(2.0)).toBe(60_000)
    expect(calculateSuryaGharSubsidy(2.4)).toBe(60_000)
  })

  it('caps subsidy at ₹78,000 for systems 2.5 kW and above', () => {
    expect(calculateSuryaGharSubsidy(3.0)).toBe(78_000)
    expect(calculateSuryaGharSubsidy(5.0)).toBe(78_000)
    expect(calculateSuryaGharSubsidy(10.0)).toBe(78_000)
  })
})

describe('calculateCommunityRoi', () => {
  it('handles renter mode with 0 m² rooftop space', () => {
    const input: RoiCalculatorInput = {
      monthlyBillInr: 4000,
      roofAreaM2: 0,
      p2pSharePercent: 40,
    }
    const result = calculateCommunityRoi(input)

    expect(result.isRenter).toBe(true)
    expect(result.recommendedKw).toBe(0)
    expect(result.grossSystemCostInr).toBe(0)
    expect(result.netInvestmentInr).toBe(0)
    expect(result.paybackYears).toBe(0)
    expect(result.annualGridSavingsInr).toBeGreaterThan(0)
    expect(result.annualP2pEarningsInr).toBe(0)
    expect(result.annualCo2Kg).toBeGreaterThan(0)
    expect(result.treesEquivalent).toBeGreaterThan(0)
  })

  it('calculates prosumer ROI with standard rooftop space', () => {
    const input: RoiCalculatorInput = {
      monthlyBillInr: 3500,
      roofAreaM2: 30,
      p2pSharePercent: 40,
    }
    const result = calculateCommunityRoi(input)

    expect(result.isRenter).toBe(false)
    expect(result.recommendedKw).toBeGreaterThanOrEqual(1)
    expect(result.recommendedKw).toBeLessThanOrEqual(30 / 6.5)
    expect(result.grossSystemCostInr).toBe(Math.round(result.recommendedKw * 50_000))
    expect(result.subsidyInr).toBeGreaterThan(0)
    expect(result.netInvestmentInr).toBe(result.grossSystemCostInr - result.subsidyInr)
    expect(result.annualGridSavingsInr).toBeGreaterThan(0)
    expect(result.annualP2pEarningsInr).toBeGreaterThan(0)
    expect(result.netAnnualBenefitInr).toBe(result.annualGridSavingsInr + result.annualP2pEarningsInr)
    expect(result.paybackYears).toBeGreaterThan(0)
    expect(result.paybackYears).toBeLessThan(10)
    expect(result.annualCo2Kg).toBeGreaterThan(0)
    expect(result.treesEquivalent).toBeGreaterThan(0)
  })

  it('clamps invalid or negative input values safely', () => {
    const result = calculateCommunityRoi({
      monthlyBillInr: -500,
      roofAreaM2: -10,
      p2pSharePercent: 150,
    })

    expect(result.isRenter).toBe(true)
    expect(result.estimatedMonthlyKwh).toBe(0)
    expect(result.netAnnualBenefitInr).toBe(0)
  })
})
