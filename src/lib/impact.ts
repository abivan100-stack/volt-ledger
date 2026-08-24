import { carbonAvoidedKg } from './carbon'
import { autonomyPct, type GridDependenceBreakdown } from './gridDependence'

/** Baselines used by the product's grid-versus-community comparison. */
export const GRID_BUYBACK_RATE_INR_PER_KWH = 3
export const GRID_RETAIL_RATE_INR_PER_KWH = 8

export interface ImpactSummaryInput {
  totalKwh: number
  totalCredit: number
  dailyBreakdown: GridDependenceBreakdown
}

export interface ImpactSummary {
  communitySettlementInr: number
  sellerUpliftInr: number
  buyerSavingInr: number
  carbonAvoidedKg: number
  autonomyPct: number
}

/**
 * Derives the competition-facing impact figures from the same synthetic
 * settlements shown in the ledger. Values are comparative illustrations, not
 * payments, bills, or meter data.
 */
export function impactSummary({ totalKwh, totalCredit, dailyBreakdown }: ImpactSummaryInput): ImpactSummary {
  const safeKwh = Number.isFinite(totalKwh) ? totalKwh : 0
  const safeCredit = Number.isFinite(totalCredit) ? totalCredit : 0
  const gridBuybackValue = safeKwh * GRID_BUYBACK_RATE_INR_PER_KWH
  const gridRetailCost = safeKwh * GRID_RETAIL_RATE_INR_PER_KWH

  return {
    communitySettlementInr: safeCredit,
    sellerUpliftInr: safeCredit - gridBuybackValue,
    buyerSavingInr: gridRetailCost - safeCredit,
    carbonAvoidedKg: carbonAvoidedKg(safeKwh),
    autonomyPct: autonomyPct(dailyBreakdown),
  }
}
