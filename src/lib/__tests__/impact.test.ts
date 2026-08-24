import { describe, expect, it } from 'vitest'
import {
  GRID_BUYBACK_RATE_INR_PER_KWH,
  GRID_RETAIL_RATE_INR_PER_KWH,
  impactSummary,
} from '../impact'

describe('impactSummary', () => {
  it('compares the settled community value against the stated grid baselines', () => {
    const summary = impactSummary({
      totalKwh: 10,
      totalCredit: 55,
      dailyBreakdown: { solarPct: 30, batteryPct: 20, tradePct: 15, gridPct: 35 },
    })

    expect(GRID_BUYBACK_RATE_INR_PER_KWH).toBe(3)
    expect(GRID_RETAIL_RATE_INR_PER_KWH).toBe(8)
    expect(summary).toEqual({
      communitySettlementInr: 55,
      sellerUpliftInr: 25,
      buyerSavingInr: 25,
      carbonAvoidedKg: 7.1,
      autonomyPct: 65,
    })
  })

  it('keeps an empty settlement at zero while retaining the modeled autonomy reading', () => {
    expect(
      impactSummary({
        totalKwh: 0,
        totalCredit: 0,
        dailyBreakdown: { solarPct: 45, batteryPct: 15, tradePct: 10, gridPct: 30 },
      }),
    ).toEqual({
      communitySettlementInr: 0,
      sellerUpliftInr: 0,
      buyerSavingInr: 0,
      carbonAvoidedKg: 0,
      autonomyPct: 70,
    })
  })
})
