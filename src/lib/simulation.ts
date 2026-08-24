/**
 * Full 24h day model.
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

const FNV_OFFSET_BASIS = 2166136261
const FNV_PRIME = 16777619
const FNV_FOLD = 1_000_000

// Deterministic FNV-1a style hash of a handful of integer keys, folded into [0, 1).
export function seededUnit(...keys: number[]): number {
  let h = FNV_OFFSET_BASIS
  for (const key of keys) {
    if (!Number.isFinite(key)) return 0
    h = Math.imul(h ^ Math.floor(key), FNV_PRIME)
    h ^= h >>> 13
  }
  h ^= h >>> 16
  return ((h >>> 0) % FNV_FOLD) / FNV_FOLD
}

function bump(hour: number, center: number, width: number): number {
  return Math.exp(-(((hour - center) / width) ** 2))
}

const SOLAR_START_HOUR = 6
const SOLAR_END_HOUR = 18.5
const SOLAR_DAYLIGHT_HOURS = SOLAR_END_HOUR - SOLAR_START_HOUR

const CLOUDY_SCALE = 0.45
const HEATWAVE_SCALE = 1.08

export const INVERTER_EFFICIENCY = 0.9
const TICK_INTERVAL_HOURS = 10 / 60

/** Bell-shaped solar capacity factor for `hour` (0-23.99), zero outside ~06:00-18:30. */
export function solarCurve(hour: number, dayType: DayType): number {
  if (!Number.isFinite(hour)) return 0
  if (hour < SOLAR_START_HOUR || hour > SOLAR_END_HOUR) return 0
  const shape = Math.max(0, Math.sin((Math.PI * (hour - SOLAR_START_HOUR)) / SOLAR_DAYLIGHT_HOURS))
  if (dayType === 'cloudy') return shape * CLOUDY_SCALE
  if (dayType === 'heatwave') return shape * HEATWAVE_SCALE
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
const DEMAND_JITTER_MIN = 0.92
const DEMAND_JITTER_RANGE = 0.16
const DEMAND_SEED_DAYTYPE = 97
const DEMAND_SEED_HOUR = 13
const DEMAND_SEED_HOUSEHOLD = 31

const CLOUD_JITTER_MIN = 0.94
const CLOUD_JITTER_RANGE = 0.12
const CLOUD_SEED_DAYTYPE = 53
const CLOUD_SEED_SUBMINUTE = 12
const CLOUD_SEED_HOUSEHOLD = 17

const RATE_SEED_TICK = 71

export function demandCurve(hour: number, household: DemandHousehold, dayType: DayType): number {
  const shape = demandShape(hour, dayType)
  const jitter = DEMAND_JITTER_MIN + DEMAND_JITTER_RANGE * seededUnit(dayTypeKey(dayType) * DEMAND_SEED_DAYTYPE, Math.floor(hour) * DEMAND_SEED_HOUR, household.id * DEMAND_SEED_HOUSEHOLD)
  return household.base * shape * jitter
}

export function integrateGenerationAndConsumption(
  pv: number,
  baseLoad: number,
  householdId: number,
  dayType: DayType,
  uptoMinute: number,
): { gen: number; con: number } {
  if (!Number.isFinite(pv) || !Number.isFinite(baseLoad) || !Number.isFinite(uptoMinute)) return { gen: 0, con: 0 }
  // Exclusive upper bound: integrates [0, uptoMinute) in 10-minute steps
  let gen = 0
  let con = 0
  for (let minute = 0; minute < uptoMinute; minute += 10) {
    const hour = minute / 60
    gen += pv * solarCurve(hour, dayType) * INVERTER_EFFICIENCY * TICK_INTERVAL_HOURS
    con += demandCurve(hour, { id: householdId, base: baseLoad }, dayType) * TICK_INTERVAL_HOURS
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
  const cloudJitter = CLOUD_JITTER_MIN + CLOUD_JITTER_RANGE * seededUnit(dayTypeKey(dayType) * CLOUD_SEED_DAYTYPE, Math.floor(hour * CLOUD_SEED_SUBMINUTE), householdId * CLOUD_SEED_HOUSEHOLD)
  const out = Math.max(0, pv * sun * INVERTER_EFFICIENCY * cloudJitter)
  const draw = demandCurve(hour, { id: householdId, base: baseLoad }, dayType)
  return { out, draw, net: out - draw }
}

const RATE_MIN = 4.4
const RATE_MAX = 7.2
export const RATE_BASE = 5.5
const RATE_SUPPLY_DEMAND_FACTOR = 0.3
const RATE_SMOOTHING = 0.25
const RATE_JITTER_AMPLITUDE = 0.05

export function nextCommunityRate(currentRate: number, supply: number, demand: number, tickCount: number): number {
  const target = Math.min(RATE_MAX, Math.max(RATE_MIN, RATE_BASE + (demand - supply) * RATE_SUPPLY_DEMAND_FACTOR))
  const jitter = (seededUnit(tickCount * RATE_SEED_TICK) - 0.5) * RATE_JITTER_AMPLITUDE
  return Math.min(RATE_MAX, Math.max(RATE_MIN, currentRate + (target - currentRate) * RATE_SMOOTHING + jitter))
}
