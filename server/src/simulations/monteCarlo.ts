import { createHash } from 'node:crypto'
import type { SimulationOutcome } from '../db/models.js'

export const MONTE_CARLO_MODEL_VERSION = 'monte-carlo-v1' as const
export const SIMULATION_DAY_TYPES = ['sunny-weekday', 'cloudy', 'weekend', 'heatwave'] as const
export type SimulationDayType = (typeof SIMULATION_DAY_TYPES)[number]

const SIMULATION_OUTCOMES: readonly SimulationOutcome[] = ['p10', 'p50', 'p90', 'selected']
const INTERVAL_MINUTES = [10, 30, 60] as const
const MIN_SAMPLE_COUNT = 10
const MAX_SAMPLE_COUNT = 250
const MAX_HOUSEHOLDS = 50
const MIN_RATE_INR = 0
const MAX_RATE_INR = 20
const DAY_MINUTES = 24 * 60
const INVERTER_EFFICIENCY = 0.9
const SOLAR_START_HOUR = 6
const SOLAR_END_HOUR = 18.5
const SOLAR_DAYLIGHT_HOURS = SOLAR_END_HOUR - SOLAR_START_HOUR
const FNV_OFFSET_BASIS = 2166136261
const FNV_PRIME = 16777619

export interface SimulationHouseholdInput {
  id: string
  pvKw: number
  baseLoadKw: number
}

export interface MonteCarloInput {
  simulationDate: string
  dayType: SimulationDayType
  households: SimulationHouseholdInput[]
  sampleCount: number
  intervalMinutes: (typeof INTERVAL_MINUTES)[number]
  rateInrPerKwh: number
}

export interface SimulationIntervalResult {
  householdId: string
  intervalStart: string
  intervalEnd: string
  generatedKwh: number
  consumedKwh: number
  importedKwh: number
  exportedKwh: number
  estimatedCreditInr: number
  outcome: SimulationOutcome
}

export interface SimulationSummaryResult {
  householdId: string
  outcome: SimulationOutcome
  intervalCount: number
  generatedKwh: number
  consumedKwh: number
  importedKwh: number
  exportedKwh: number
  estimatedCreditInr: number
}

export interface MonteCarloResult {
  intervals: SimulationIntervalResult[]
  summaries: SimulationSummaryResult[]
  resultDigest: string
}

interface SampleMetrics {
  generatedKwh: number
  consumedKwh: number
}

interface RecordValue {
  [key: string]: unknown
}

function isRecord(value: unknown): value is RecordValue {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function invalidInput(): never {
  throw new Error('INVALID_SIMULATION_INPUT')
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

export function parseMonteCarloInput(value: unknown): MonteCarloInput {
  if (!isRecord(value)) return invalidInput()

  const simulationDate = value.simulationDate
  const dayType = value.dayType
  const households = value.households
  const sampleCount = value.sampleCount
  const intervalMinutes = value.intervalMinutes
  const rateInrPerKwh = value.rateInrPerKwh

  if (
    typeof simulationDate !== 'string' ||
    !validDate(simulationDate) ||
    typeof dayType !== 'string' ||
    !SIMULATION_DAY_TYPES.includes(dayType as SimulationDayType) ||
    !Array.isArray(households) ||
    households.length === 0 ||
    households.length > MAX_HOUSEHOLDS ||
    typeof sampleCount !== 'number' ||
    !Number.isInteger(sampleCount) ||
    sampleCount < MIN_SAMPLE_COUNT ||
    sampleCount > MAX_SAMPLE_COUNT ||
    typeof intervalMinutes !== 'number' ||
    !INTERVAL_MINUTES.includes(intervalMinutes as (typeof INTERVAL_MINUTES)[number]) ||
    !finiteNumber(rateInrPerKwh) ||
    rateInrPerKwh < MIN_RATE_INR ||
    rateInrPerKwh > MAX_RATE_INR
  ) {
    return invalidInput()
  }

  const seenIds = new Set<string>()
  const parsedHouseholds: SimulationHouseholdInput[] = []
  for (const household of households) {
    if (!isRecord(household) || typeof household.id !== 'string') return invalidInput()
    const id = household.id.trim()
    if (
      id.length === 0 ||
      id.length > 120 ||
      seenIds.has(id) ||
      !finiteNumber(household.pvKw) ||
      household.pvKw < 0 ||
      household.pvKw > 20 ||
      !finiteNumber(household.baseLoadKw) ||
      household.baseLoadKw <= 0 ||
      household.baseLoadKw > 20
    ) {
      return invalidInput()
    }
    seenIds.add(id)
    parsedHouseholds.push({
      id,
      pvKw: household.pvKw,
      baseLoadKw: household.baseLoadKw,
    })
  }

  return {
    simulationDate,
    dayType: dayType as SimulationDayType,
    households: parsedHouseholds,
    sampleCount,
    intervalMinutes: intervalMinutes as (typeof INTERVAL_MINUTES)[number],
    rateInrPerKwh,
  }
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`)
    return `{${entries.join(',')}}`
  }
  return JSON.stringify(value)
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export function digestSimulationInput(value: unknown): string {
  return sha256(stableSerialize(parseMonteCarloInput(value)))
}

/**
 * Digests an input that has already been parsed.
 *
 * The worker parses a stored run's snapshot once to run the model; digesting
 * it again would re-parse the same snapshot. The public entry point keeps
 * parsing, so callers can never digest a shape the model would not accept.
 */
export function digestParsedSimulationInput(input: MonteCarloInput): string {
  return sha256(stableSerialize(input))
}

function seededUnit(seed: string, ...keys: Array<string | number>): number {
  const value = `${seed}|${keys.join('|')}`
  let hash = FNV_OFFSET_BASIS
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), FNV_PRIME)
    hash ^= hash >>> 13
  }
  hash ^= hash >>> 16
  return (hash >>> 0) / 4_294_967_296
}

function solarCurve(hour: number, dayType: SimulationDayType): number {
  if (hour < SOLAR_START_HOUR || hour > SOLAR_END_HOUR) return 0
  const shape = Math.max(0, Math.sin((Math.PI * (hour - SOLAR_START_HOUR)) / SOLAR_DAYLIGHT_HOURS))
  if (dayType === 'cloudy') return shape * 0.45
  if (dayType === 'heatwave') return shape * 1.08
  return shape
}

function bump(hour: number, center: number, width: number): number {
  return Math.exp(-(((hour - center) / width) ** 2))
}

function demandShape(hour: number, dayType: SimulationDayType): number {
  switch (dayType) {
    case 'weekend':
      return (hour >= 7 && hour <= 23 ? 0.4 : 0.18) + 0.65 * bump(hour, 9, 2.4) + 0.85 * bump(hour, 13.5, 3) + 1.1 * bump(hour, 19.5, 2.6)
    case 'heatwave':
      return (hour >= 6 && hour <= 23 ? 0.4 : 0.2) + 0.7 * bump(hour, 7.5, 1.6) + 1.3 * bump(hour, 20, 2.2) + 1.6 * bump(hour, 16, 4.2)
    case 'sunny-weekday':
    case 'cloudy':
      return (hour >= 6 && hour <= 22 ? 0.34 : 0.16) + 1 * bump(hour, 7.5, 1.6) + 1.85 * bump(hour, 20, 2)
  }
}

function round(value: number): number {
  const rounded = Math.round(value * 1_000_000) / 1_000_000
  return Object.is(rounded, -0) ? 0 : rounded
}

function quantile(values: number[], probability: number): number {
  const sorted = values.toSorted((left, right) => left - right)
  const position = (sorted.length - 1) * probability
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  if (lower === upper) return sorted[lower]
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower)
}

function metricsForOutcome(
  generatedValues: number[],
  consumedValues: number[],
  outcome: SimulationOutcome,
  selectedIndex: number,
): SampleMetrics {
  if (outcome === 'selected') {
    return {
      generatedKwh: generatedValues[selectedIndex],
      consumedKwh: consumedValues[selectedIndex],
    }
  }
  const probability = outcome === 'p10' ? 0.1 : outcome === 'p50' ? 0.5 : 0.9
  return {
    generatedKwh: quantile(generatedValues, probability),
    consumedKwh: quantile(consumedValues, probability),
  }
}

function toIntervalMetrics(metrics: SampleMetrics, rateInrPerKwh: number) {
  const generatedKwh = round(Math.max(0, metrics.generatedKwh))
  const consumedKwh = round(Math.max(0, metrics.consumedKwh))
  const importedKwh = round(Math.max(0, consumedKwh - generatedKwh))
  const exportedKwh = round(Math.max(0, generatedKwh - consumedKwh))
  return {
    generatedKwh,
    consumedKwh,
    importedKwh,
    exportedKwh,
    estimatedCreditInr: round(exportedKwh * rateInrPerKwh),
  }
}

export function runMonteCarlo(value: unknown, seed: string): MonteCarloResult {
  const input = parseMonteCarloInput(value)
  if (typeof seed !== 'string' || seed.trim().length === 0 || seed.length > 128) return invalidInput()

  const intervalCount = DAY_MINUTES / input.intervalMinutes
  const simulationStart = new Date(`${input.simulationDate}T00:00:00.000Z`)
  const metricsByKey = new Map<string, SampleMetrics[]>()

  for (let sampleIndex = 0; sampleIndex < input.sampleCount; sampleIndex += 1) {
    for (let intervalIndex = 0; intervalIndex < intervalCount; intervalIndex += 1) {
      const hour = (intervalIndex * input.intervalMinutes + input.intervalMinutes / 2) / 60
      for (const household of input.households) {
        const cloudJitter = 0.9 + seededUnit(seed, 'solar', sampleIndex, intervalIndex, household.id) * 0.2
        const demandJitter = 0.9 + seededUnit(seed, 'demand', sampleIndex, intervalIndex, household.id) * 0.2
        const intervalHours = input.intervalMinutes / 60
        const generatedKwh = household.pvKw * solarCurve(hour, input.dayType) * INVERTER_EFFICIENCY * cloudJitter * intervalHours
        const consumedKwh = household.baseLoadKw * demandShape(hour, input.dayType) * demandJitter * intervalHours
        const key = `${household.id}\u0000${intervalIndex}`
        const samples = metricsByKey.get(key) ?? []
        samples.push({ generatedKwh, consumedKwh })
        metricsByKey.set(key, samples)
      }
    }
  }

  const intervals: SimulationIntervalResult[] = []
  const selectedIndex = Math.floor(input.sampleCount / 2)
  for (const household of input.households) {
    for (let intervalIndex = 0; intervalIndex < intervalCount; intervalIndex += 1) {
      const key = `${household.id}\u0000${intervalIndex}`
      const samples = metricsByKey.get(key)
      if (!samples) return invalidInput()
      const generatedValues = samples.map((sample) => sample.generatedKwh)
      const consumedValues = samples.map((sample) => sample.consumedKwh)
      const intervalStartDate = new Date(simulationStart.getTime() + intervalIndex * input.intervalMinutes * 60_000)
      const intervalEndDate = new Date(intervalStartDate.getTime() + input.intervalMinutes * 60_000)

      for (const outcome of SIMULATION_OUTCOMES) {
        const metrics = toIntervalMetrics(
          metricsForOutcome(generatedValues, consumedValues, outcome, selectedIndex),
          input.rateInrPerKwh,
        )
        intervals.push({
          householdId: household.id,
          intervalStart: intervalStartDate.toISOString(),
          intervalEnd: intervalEndDate.toISOString(),
          ...metrics,
          outcome,
        })
      }
    }
  }

  const summaries: SimulationSummaryResult[] = []
  for (const household of input.households) {
    for (const outcome of SIMULATION_OUTCOMES) {
      const householdIntervals = intervals.filter(
        (interval) => interval.householdId === household.id && interval.outcome === outcome,
      )
      summaries.push({
        householdId: household.id,
        outcome,
        intervalCount: householdIntervals.length,
        generatedKwh: round(householdIntervals.reduce((sum, interval) => sum + interval.generatedKwh, 0)),
        consumedKwh: round(householdIntervals.reduce((sum, interval) => sum + interval.consumedKwh, 0)),
        importedKwh: round(householdIntervals.reduce((sum, interval) => sum + interval.importedKwh, 0)),
        exportedKwh: round(householdIntervals.reduce((sum, interval) => sum + interval.exportedKwh, 0)),
        estimatedCreditInr: round(householdIntervals.reduce((sum, interval) => sum + interval.estimatedCreditInr, 0)),
      })
    }
  }

  const resultDigest = sha256(stableSerialize({
    modelVersion: MONTE_CARLO_MODEL_VERSION,
    seed,
    input,
    intervals,
    summaries,
  }))
  return { intervals, summaries, resultDigest }
}
