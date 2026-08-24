import { solarCurve, demandCurve, INVERTER_EFFICIENCY, type DayType } from './simulation'

/**
 * Grid dependence: the share of total community demand still met by grid
 * import, after (1) solar self-consumption, (2) local peer-to-peer trade,
 * and (3) battery discharge have each taken their share. The four
 * percentages always sum to 100 of demand by construction — see
 * `assertSumsTo100`.
 *
 * Two simplifications, stated plainly:
 * - Local trade only matches surplus and deficit within the same instant —
 *   `min(surplus, residual demand)` at that moment — never a surplus from one
 *   hour covering a deficit hours later. Only a battery can move energy
 *   across time; trade cannot.
 * - Battery is modeled as a community-wide capacity pool (each household's
 *   rated `batt`, kWh, summed) drawn against the day's *post-trade* residual
 *   demand once. There is no charge-rate/C-rate limit and no hour-by-hour
 *   state of charge — a single-cycle-per-day approximation, good enough for
 *   a comparative meter, not a battery dispatch model.
 */
export interface GridDependenceBreakdown {
  solarPct: number
  batteryPct: number
  tradePct: number
  gridPct: number
}

export interface GridDependenceHousehold {
  id: number
  pv: number
  base: number
  batt: number
}

function assertSumsTo100(breakdown: GridDependenceBreakdown): void {
  if (!import.meta.env?.DEV) return
  const sum = breakdown.solarPct + breakdown.batteryPct + breakdown.tradePct + breakdown.gridPct
  console.assert(
    Math.abs(sum - 100) < 0.05,
    `Grid dependence breakdown must sum to 100%, got ${sum.toFixed(4)}`,
  )
}

function breakdownFromEnergy(
  demand: number,
  selfSolar: number,
  localTrade: number,
  residualAfterTrade: number,
  totalBatteryKwh: number,
): GridDependenceBreakdown {
  if (!Number.isFinite(demand) || demand <= 0) return { solarPct: 0, batteryPct: 0, tradePct: 0, gridPct: 0 }

  const batteryUsed = Math.min(totalBatteryKwh, residualAfterTrade)
  const gridImport = residualAfterTrade - batteryUsed

  const breakdown: GridDependenceBreakdown = {
    solarPct: (selfSolar / demand) * 100,
    tradePct: (localTrade / demand) * 100,
    batteryPct: (batteryUsed / demand) * 100,
    gridPct: (gridImport / demand) * 100,
  }
  assertSumsTo100(breakdown)
  return breakdown
}

function sampleHousehold(
  household: GridDependenceHousehold,
  hour: number,
  dayType: DayType,
): { out: number; draw: number } {
  const out = household.pv * solarCurve(hour, dayType) * INVERTER_EFFICIENCY
  const draw = demandCurve(hour, { id: household.id, base: household.base }, dayType)
  return { out, draw }
}

/** One instant's demand/self-solar/surplus/residual across all households. */
function sampleCommunity(households: GridDependenceHousehold[], hour: number, dayType: DayType) {
  let demand = 0
  let selfSolar = 0
  let surplus = 0
  let residual = 0
  for (const household of households) {
    const { out, draw } = sampleHousehold(household, hour, dayType)
    demand += draw
    selfSolar += Math.min(out, draw)
    surplus += Math.max(0, out - draw)
    residual += Math.max(0, draw - out)
  }
  return { demand, selfSolar, surplus, residual }
}

/** Instantaneous grid-dependence breakdown for `hour` (0-23.99), modeled — not live-tick — values. */
export function hourlyGridDependence(
  households: GridDependenceHousehold[],
  hour: number,
  dayType: DayType,
): GridDependenceBreakdown {
  const { demand, selfSolar, surplus, residual } = sampleCommunity(households, hour, dayType)
  const localTrade = Math.min(surplus, residual)
  const totalBatteryKwh = households.reduce((sum, h) => sum + h.batt, 0)
  return breakdownFromEnergy(demand, selfSolar, localTrade, residual - localTrade, totalBatteryKwh)
}

/** Grid-dependence breakdown integrated over the full 24h day. */
export function dailyGridDependence(
  households: GridDependenceHousehold[],
  dayType: DayType,
): GridDependenceBreakdown {
  const STEP_MINUTES = 10
  const dtHours = STEP_MINUTES / 60
  const totalBatteryKwh = households.reduce((sum, h) => sum + h.batt, 0)

  let demand = 0
  let selfSolar = 0
  let localTrade = 0
  let residualAfterTrade = 0

  for (let minute = 0; minute < 24 * 60; minute += STEP_MINUTES) {
    const hour = minute / 60
    const step = sampleCommunity(households, hour, dayType)
    const stepTrade = Math.min(step.surplus, step.residual)
    demand += step.demand * dtHours
    selfSolar += step.selfSolar * dtHours
    localTrade += stepTrade * dtHours
    residualAfterTrade += (step.residual - stepTrade) * dtHours
  }

  return breakdownFromEnergy(demand, selfSolar, localTrade, residualAfterTrade, totalBatteryKwh)
}

/**
 * Neighbourhood autonomy: the share of demand met WITHOUT grid import —
 * solar direct + battery + local trade. Always `100 - breakdown.gridPct`,
 * read off the same breakdown Grid Dependence renders, so the two figures
 * can never disagree.
 */
export function autonomyPct(breakdown: GridDependenceBreakdown): number {
  return 100 - breakdown.gridPct
}
