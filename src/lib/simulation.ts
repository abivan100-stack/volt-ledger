/**
 * Full 24h day model (Phase 1 of VOLT_BUILD_PLAN.md).
 *
 * Every export here is a pure function of its arguments: (dayType, hour,
 * householdId) in, a number out, nothing accumulated across ticks. This is
 * load-bearing for a future replay/scrub feature — querying hour 14 twice (or
 * hour 9 without ever having computed hours 0-8) must return the same value.
 * Any per-household variation comes from `seededUnit`, a deterministic hash,
 * never from Math.random() or performance.now().
 */

export const DAY_TYPES = ['sunny-weekday', 'cloudy', 'weekend', 'heatwave'] as const
export type DayType = (typeof DAY_TYPES)[number]

export const DAY_TYPE_LABELS: Record<DayType, string> = {
  'sunny-weekday': 'Sunny Weekday',
  cloudy: 'Cloudy',
  weekend: 'Weekend',
  heatwave: 'Heatwave',
}

function dayTypeKey(dayType: DayType): number {
  return DAY_TYPES.indexOf(dayType)
}

// Deterministic FNV-1a style hash of a handful of integer keys, folded into [0, 1).
export function seededUnit(...keys: number[]): number {
  let h = 2166136261
  for (const key of keys) {
    h = Math.imul(h ^ Math.floor(key), 16777619)
    h ^= h >>> 13
  }
  h ^= h >>> 16
  return ((h >>> 0) % 1_000_000) / 1_000_000
}

function bump(hour: number, center: number, width: number): number {
  return Math.exp(-(((hour - center) / width) ** 2))
}

/** Bell-shaped solar capacity factor for `hour` (0-23.99), zero outside ~06:00-18:30. */
export function solarCurve(hour: number, dayType: DayType): number {
  if (hour < 6 || hour > 18.5) return 0
  const shape = Math.max(0, Math.sin((Math.PI * (hour - 6)) / 12.5))
  if (dayType === 'cloudy') return shape * 0.45
  if (dayType === 'heatwave') return shape * 1.08
  return shape
}

function demandShape(hour: number, dayType: DayType): number {
  switch (dayType) {
    case 'weekend': {
      const morning = bump(hour, 9, 2.4)
      const midday = bump(hour, 13.5, 3.0)
      const evening = bump(hour, 19.5, 2.6)
      const dayBaseline = hour >= 7 && hour <= 23 ? 0.4 : 0.18
      return dayBaseline + 0.65 * morning + 0.85 * midday + 1.1 * evening
    }
    case 'heatwave': {
      const morning = bump(hour, 7.5, 1.6)
      const evening = bump(hour, 20, 2.2)
      const cooling = bump(hour, 16, 4.2)
      const dayBaseline = hour >= 6 && hour <= 23 ? 0.4 : 0.2
      return dayBaseline + 0.7 * morning + 1.3 * evening + 1.6 * cooling
    }
    case 'sunny-weekday':
    default: {
      const morning = bump(hour, 7.5, 1.6)
      const evening = bump(hour, 20, 2.0)
      const dayBaseline = hour >= 6 && hour <= 22 ? 0.34 : 0.16
      return dayBaseline + 1.0 * morning + 1.85 * evening
    }
  }
}

export interface DemandHousehold {
  id: number
  base: number
}

/** Household demand in kW at `hour` (0-23.99) — its own shape, independent of solar. */
export function demandCurve(hour: number, household: DemandHousehold, dayType: DayType): number {
  const shape = demandShape(hour, dayType)
  const jitter = 0.92 + 0.16 * seededUnit(dayTypeKey(dayType) * 97, Math.floor(hour) * 13, household.id * 31)
  return household.base * shape * jitter
}

export function integrateGenerationAndConsumption(
  pv: number,
  baseLoad: number,
  householdId: number,
  dayType: DayType,
  uptoMinute: number,
): { gen: number; con: number } {
  let gen = 0
  let con = 0
  for (let minute = 0; minute < uptoMinute; minute += 10) {
    const hour = minute / 60
    gen += pv * solarCurve(hour, dayType) * 0.9 * (10 / 60)
    con += demandCurve(hour, { id: householdId, base: baseLoad }, dayType) * (10 / 60)
  }
  return { gen, con }
}

export interface HouseholdTick {
  out: number
  draw: number
  net: number
}

export function tickHousehold(
  pv: number,
  baseLoad: number,
  householdId: number,
  simMinute: number,
  dayType: DayType,
): HouseholdTick {
  const hour = simMinute / 60
  const sun = solarCurve(hour, dayType)
  const cloudJitter = 0.94 + 0.12 * seededUnit(dayTypeKey(dayType) * 53, Math.floor(hour * 12), householdId * 17)
  const out = Math.max(0, pv * sun * 0.9 * cloudJitter)
  const draw = demandCurve(hour, { id: householdId, base: baseLoad }, dayType)
  return { out, draw, net: out - draw }
}

export function nextCommunityRate(currentRate: number, supply: number, demand: number, tickCount: number): number {
  const target = Math.min(7.2, Math.max(4.4, 5.5 + (demand - supply) * 0.3))
  const jitter = (seededUnit(tickCount * 71) - 0.5) * 0.05
  return currentRate + (target - currentRate) * 0.25 + jitter
}
