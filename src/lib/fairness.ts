/**
 * Fairness: how evenly today's local trading benefits landed across
 * households. Net benefit = what a household earned selling surplus, minus
 * what it spent buying — today's trading only. It is NOT the running
 * account `balance` shown on the household cards (that includes whatever
 * balance a household started the simulation with); it reconciles with the
 * EARNED/SPENT figures shown in that household's dossier.
 *
 * Deliberately simple: spread (best minus worst) and a ratio, nothing more.
 * A Gini coefficient would fold the whole distribution into one number —
 * only worth adding once this simpler version is proven useful.
 */
export interface FairnessHousehold {
  name: string
  earned: number
  spent: number
}

export interface HouseholdBenefit {
  name: string
  netBenefit: number
}

export interface FairnessSummary {
  households: HouseholdBenefit[]
  best: HouseholdBenefit
  worst: HouseholdBenefit
  spread: number
  /** best ÷ worst, in multiples. `null` when the worst-off household earned nothing (ratio isn't meaningful). */
  ratio: number | null
}

export function netBenefit(household: FairnessHousehold): number {
  return household.earned - household.spent
}

export function fairnessSummary(households: FairnessHousehold[]): FairnessSummary {
  const benefits = households.map((household) => ({
    name: household.name,
    netBenefit: netBenefit(household),
  }))

  if (benefits.length === 0) {
    throw new Error('fairnessSummary requires at least one household')
  }

  let best = benefits[0]
  let worst = benefits[0]
  for (const benefit of benefits) {
    if (benefit.netBenefit > best.netBenefit) best = benefit
    if (benefit.netBenefit < worst.netBenefit) worst = benefit
  }

  const spread = best.netBenefit - worst.netBenefit
  const ratio = worst.netBenefit > 0 ? best.netBenefit / worst.netBenefit : null

  return { households: benefits, best, worst, spread, ratio }
}
