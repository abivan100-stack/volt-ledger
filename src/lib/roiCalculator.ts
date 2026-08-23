/**
 * Pure mathematical model for community rooftop solar ROI, savings, and carbon
 * avoided calculations.
 *
 * Models the economics of residential rooftop solar under the Indian PM Surya Ghar
 * subsidy scheme and compares peer-to-peer microgrid trading against standard
 * TANGEDCO (Tamil Nadu) residential LT-1A grid tariffs and feed-in credits.
 *
 * Rules:
 * - Pure logic only: no React, no DOM, no Zustand store imports.
 */

export interface RoiCalculatorInput {
  /** Monthly electricity bill in INR (₹1,500 - ₹15,000) */
  monthlyBillInr: number
  /** Usable rooftop area in square meters (0 - 100 m²). 0 represents tenant/renter. */
  roofAreaM2: number
  /** Percentage of surplus energy exported to peers (20% - 80%) */
  p2pSharePercent: number
}

export interface RoiCalculatorOutput {
  /** Recommended Solar PV system capacity in kW (0 for renters) */
  recommendedKw: number
  /** Whether the user is an apartment renter / tenant with no roof ownership */
  isRenter: boolean
  /** Estimated monthly unit consumption in kWh */
  estimatedMonthlyKwh: number
  /** Estimated annual solar generation in kWh (0 for renters) */
  annualGenerationKwh: number
  /** Estimated annual electricity savings from avoided grid purchase (INR) */
  annualGridSavingsInr: number
  /** Estimated annual revenue from selling surplus solar to peers at ₹5.50/kWh (INR) */
  annualP2pEarningsInr: number
  /** Total net annual financial benefit in INR (savings + earnings) */
  netAnnualBenefitInr: number
  /** Total gross system installation cost before subsidy (INR) */
  grossSystemCostInr: number
  /** PM Surya Ghar government subsidy in INR */
  subsidyInr: number
  /** Net investment cost after government subsidy (INR) */
  netInvestmentInr: number
  /** Estimated payback period in years (0 for renters) */
  paybackYears: number
  /** Estimated annual CO2 emissions avoided in kg */
  annualCo2Kg: number
  /** Equivalent number of trees planted per year */
  treesEquivalent: number
}

/** Solar yield in Chennai/Tamil Nadu: ~4.2 kWh generated per kW capacity per day. */
export const SOLAR_YIELD_KWH_PER_KW_DAY = 4.2
export const DAYS_PER_YEAR = 365
export const ANNUAL_YIELD_PER_KW = SOLAR_YIELD_KWH_PER_KW_DAY * DAYS_PER_YEAR // ~1,533 kWh/kW/year

/** Average rooftop space required per 1 kW of Solar PV in square meters. */
export const ROOF_M2_PER_KW = 6.5

/** Standard benchmark installation cost in India (~₹50,000 / kW). */
export const BENCHMARK_COST_PER_KW_INR = 50_000

/** Average effective grid rate for urban households in Chennai (LT-1A tariff slabs). */
export const AVERAGE_GRID_RATE_INR_PER_KWH = 6.5

/** Volt Peer-to-Peer Trading Rate (INR/kWh). */
export const VOLT_P2P_RATE_INR_PER_KWH = 5.5

/** Standard DISCOM Feed-In Tariff credit for surplus export (INR/kWh). */
export const DISCOM_FEED_IN_RATE_INR_PER_KWH = 3.1

/** Grid emission factor for Southern Regional Grid: 0.82 kg CO2 / kWh. */
export const CO2_KG_PER_KWH = 0.82

/** Carbon sequestered by 1 mature tree per year: ~22 kg CO2. */
export const CO2_KG_PER_TREE_YEAR = 22

/**
 * Calculates central government PM Surya Ghar: Muft Bijli Yojana subsidy in INR.
 * - 1 kW: ₹30,000
 * - 2 kW: ₹60,000
 * - 3 kW and above: ₹78,000 (capped at ₹78,000)
 */
export function calculateSuryaGharSubsidy(kw: number): number {
  if (kw <= 0) return 0
  if (kw < 1.5) return 30_000
  if (kw < 2.5) return 60_000
  return 78_000
}

/**
 * Computes the full financial and environmental return on investment.
 */
export function calculateCommunityRoi(input: RoiCalculatorInput): RoiCalculatorOutput {
  const monthlyBill = Math.max(0, input.monthlyBillInr)
  const roofArea = Math.max(0, input.roofAreaM2)
  const p2pShare = Math.min(100, Math.max(0, input.p2pSharePercent)) / 100

  const estimatedMonthlyKwh = Math.round(monthlyBill / AVERAGE_GRID_RATE_INR_PER_KWH)
  const annualConsumptionKwh = estimatedMonthlyKwh * 12

  // Renter mode (no roof space available)
  if (roofArea < 1) {
    // Renters buy their green energy from peers at ₹5.50/kWh instead of peak grid rates (₹6.50/kWh)
    const annualP2pPurchasedKwh = annualConsumptionKwh * 0.7 // assume 70% daytime/microgrid match
    const annualGridSavingsInr = Math.round(
      annualP2pPurchasedKwh * (AVERAGE_GRID_RATE_INR_PER_KWH - VOLT_P2P_RATE_INR_PER_KWH),
    )
    const annualCo2Kg = Math.round(annualP2pPurchasedKwh * CO2_KG_PER_KWH)
    const treesEquivalent = Math.round(annualCo2Kg / CO2_KG_PER_TREE_YEAR)

    return {
      recommendedKw: 0,
      isRenter: true,
      estimatedMonthlyKwh,
      annualGenerationKwh: 0,
      annualGridSavingsInr,
      annualP2pEarningsInr: 0,
      netAnnualBenefitInr: annualGridSavingsInr,
      grossSystemCostInr: 0,
      subsidyInr: 0,
      netInvestmentInr: 0,
      paybackYears: 0,
      annualCo2Kg,
      treesEquivalent,
    }
  }

  // Homeowner / Prosumer calculation
  const maxKwByRoof = roofArea / ROOF_M2_PER_KW
  const idealKwForConsumption = annualConsumptionKwh / ANNUAL_YIELD_PER_KW

  // Recommend a system that fits the roof, sized between 1 kW and 10 kW, rounded to 1 decimal place
  const recommendedKw = Math.min(10, Math.max(1, Math.round(Math.min(maxKwByRoof, idealKwForConsumption * 1.2) * 10) / 10))

  const annualGenerationKwh = Math.round(recommendedKw * ANNUAL_YIELD_PER_KW)

  // Energy distribution: self-consumed vs. exported to peers
  const selfConsumedKwh = Math.min(annualConsumptionKwh, annualGenerationKwh * (1 - p2pShare))
  const exportedToPeersKwh = Math.max(0, annualGenerationKwh - selfConsumedKwh)

  const annualGridSavingsInr = Math.round(selfConsumedKwh * AVERAGE_GRID_RATE_INR_PER_KWH)
  const annualP2pEarningsInr = Math.round(exportedToPeersKwh * VOLT_P2P_RATE_INR_PER_KWH)
  const netAnnualBenefitInr = annualGridSavingsInr + annualP2pEarningsInr

  const grossSystemCostInr = Math.round(recommendedKw * BENCHMARK_COST_PER_KW_INR)
  const subsidyInr = calculateSuryaGharSubsidy(recommendedKw)
  const netInvestmentInr = Math.max(0, grossSystemCostInr - subsidyInr)

  const paybackYears = netAnnualBenefitInr > 0 ? Math.round((netInvestmentInr / netAnnualBenefitInr) * 10) / 10 : 0

  const annualCo2Kg = Math.round(annualGenerationKwh * CO2_KG_PER_KWH)
  const treesEquivalent = Math.round(annualCo2Kg / CO2_KG_PER_TREE_YEAR)

  return {
    recommendedKw,
    isRenter: false,
    estimatedMonthlyKwh,
    annualGenerationKwh,
    annualGridSavingsInr,
    annualP2pEarningsInr,
    netAnnualBenefitInr,
    grossSystemCostInr,
    subsidyInr,
    netInvestmentInr,
    paybackYears,
    annualCo2Kg,
    treesEquivalent,
  }
}
