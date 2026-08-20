import { describe, expect, it } from 'vitest'
import {
  MONTE_CARLO_MODEL_VERSION,
  digestSimulationInput,
  parseMonteCarloInput,
  runMonteCarlo,
  type MonteCarloInput,
} from './monteCarlo.js'

const input: MonteCarloInput = {
  simulationDate: '2030-01-01',
  dayType: 'sunny-weekday',
  households: [
    { id: 'producer-a', pvKw: 4.2, baseLoadKw: 0.6 },
    { id: 'consumer-b', pvKw: 0, baseLoadKw: 0.9 },
  ],
  sampleCount: 25,
  intervalMinutes: 60,
  rateInrPerKwh: 5.5,
}

describe('Monte Carlo simulation model', () => {
  it('produces deterministic replayable outcomes for the same seed and input', () => {
    const first = runMonteCarlo(input, 'demo-seed')
    const second = runMonteCarlo(input, 'demo-seed')

    expect(first).toEqual(second)
    expect(first.resultDigest).toMatch(/^[a-f0-9]{64}$/)
    expect(digestSimulationInput(input)).toBe(digestSimulationInput({ ...input }))
  })

  it('changes the result digest when the seed changes', () => {
    const first = runMonteCarlo(input, 'demo-seed')
    const second = runMonteCarlo(input, 'different-seed')

    expect(second.resultDigest).not.toBe(first.resultDigest)
  })

  it('stores four outcome bands for every household interval and summary', () => {
    const result = runMonteCarlo(input, 'demo-seed')

    expect(result.intervals).toHaveLength(2 * 24 * 4)
    expect(result.summaries).toHaveLength(2 * 4)
    expect(new Set(result.intervals.map((interval) => interval.outcome))).toEqual(
      new Set(['p10', 'p50', 'p90', 'selected']),
    )
    for (const interval of result.intervals) {
      expect(interval.generatedKwh).toBeGreaterThanOrEqual(0)
      expect(interval.consumedKwh).toBeGreaterThanOrEqual(0)
      expect(interval.importedKwh).toBeGreaterThanOrEqual(0)
      expect(interval.exportedKwh).toBeGreaterThanOrEqual(0)
      expect(interval.importedKwh * interval.exportedKwh).toBe(0)
      expect(interval.estimatedCreditInr).toBeCloseTo(interval.exportedKwh * input.rateInrPerKwh, 5)
    }
  })

  it('rejects malformed or unsafe simulation inputs before doing work', () => {
    expect(() => parseMonteCarloInput({ ...input, households: [] })).toThrow('INVALID_SIMULATION_INPUT')
    expect(() => parseMonteCarloInput({ ...input, sampleCount: 251 })).toThrow('INVALID_SIMULATION_INPUT')
    expect(() => parseMonteCarloInput({
      ...input,
      households: [...input.households, { ...input.households[0] }],
    })).toThrow('INVALID_SIMULATION_INPUT')
    expect(() => parseMonteCarloInput({ ...input, simulationDate: '2030-02-31' })).toThrow(
      'INVALID_SIMULATION_INPUT',
    )
    expect(MONTE_CARLO_MODEL_VERSION).toBe('monte-carlo-v1')
  })
})
