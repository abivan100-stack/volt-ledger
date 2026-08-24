import { formatMoney } from './format'
import { statusForNet, type HouseholdStatus } from './householdStatus'

export interface HouseholdBriefInput {
  name: string
  pv: number
  out: number
  draw: number
  earned: number
  spent: number
  trades: number
}

export interface HouseholdBrief {
  name: string
  status: HouseholdStatus
  system: string
  net: string
  netPositive: boolean
  out: string
  draw: string
  trades: string
  netBenefit: string
}

/** The concise household view used by the homepage energy network. */
export function buildHouseholdBrief(household: HouseholdBriefInput): HouseholdBrief {
  const netValue = household.out - household.draw
  return {
    name: household.name,
    status: statusForNet(netValue),
    system: household.pv > 0 ? `${household.pv.toFixed(1)} kW rooftop solar` : 'Grid-connected home',
    net: `${netValue >= 0 ? '+' : '−'}${Math.abs(netValue).toFixed(2)} kW`,
    netPositive: netValue >= 0,
    out: `${household.out.toFixed(2)} kW`,
    draw: `${household.draw.toFixed(2)} kW`,
    trades: `${household.trades} ${household.trades === 1 ? 'trade' : 'trades'}`,
    netBenefit: formatMoney(household.earned - household.spent),
  }
}
