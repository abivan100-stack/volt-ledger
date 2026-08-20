import { describe, expect, it } from 'vitest'
import { BACKOFF_JITTER_RATIO, computeBackoffMs } from './backoff.js'

/**
 * Retry pacing for the worker loop.
 *
 * Pure and fully determined by its arguments — the random sample is passed in
 * rather than drawn inside — so every case below is exact rather than a range.
 */

const OPTIONS = { baseMs: 1_000, maxMs: 60_000 }

/** `randomSample: 1` yields the undiscounted delay, which makes the maths visible. */
function delay(attempt: number, randomSample = 1): number {
  return computeBackoffMs(attempt, { ...OPTIONS, randomSample })
}

describe('computeBackoffMs', () => {
  it('waits the base interval after a single failure', () => {
    expect(delay(1)).toBe(1_000)
  })

  it('doubles with each consecutive failure', () => {
    expect(delay(2)).toBe(2_000)
    expect(delay(3)).toBe(4_000)
    expect(delay(4)).toBe(8_000)
    expect(delay(5)).toBe(16_000)
  })

  it('stops growing at the ceiling', () => {
    expect(delay(7)).toBe(60_000)
    expect(delay(20)).toBe(60_000)
  })

  it('survives an attempt count large enough to overflow the exponent', () => {
    // 2 ** 2000 is Infinity; the cap has to be applied before anything else.
    expect(delay(2_000)).toBe(60_000)
    expect(Number.isFinite(delay(Number.MAX_SAFE_INTEGER))).toBe(true)
  })

  it('treats a first attempt of zero or below as the first attempt', () => {
    expect(delay(0)).toBe(1_000)
    expect(delay(-5)).toBe(1_000)
  })

  it('discounts by up to the jitter ratio, so retries spread out', () => {
    // Equal jitter: the sample scales the discountable half only, leaving a floor.
    expect(delay(3, 0)).toBe(4_000 * (1 - BACKOFF_JITTER_RATIO))
    expect(delay(3, 1)).toBe(4_000)
    expect(delay(3, 0.5)).toBe(3_000)
  })

  it('never returns less than half the undiscounted delay', () => {
    for (let attempt = 1; attempt <= 10; attempt += 1) {
      const floor = delay(attempt, 0)
      const ceiling = delay(attempt, 1)
      expect(floor).toBe(Math.round(ceiling * (1 - BACKOFF_JITTER_RATIO)))
      expect(floor).toBeGreaterThan(0)
    }
  })

  it('clamps a sample from outside the unit interval', () => {
    expect(delay(3, -2)).toBe(delay(3, 0))
    expect(delay(3, 9)).toBe(delay(3, 1))
    expect(delay(3, Number.NaN)).toBe(delay(3, 1))
  })

  it('defaults to the undiscounted delay when no sample is given', () => {
    expect(computeBackoffMs(3, OPTIONS)).toBe(4_000)
  })

  it('always returns a whole number of milliseconds', () => {
    for (let attempt = 1; attempt <= 8; attempt += 1) {
      for (const sample of [0, 0.13, 0.5, 0.77, 1]) {
        expect(Number.isInteger(delay(attempt, sample)), `${attempt}/${sample}`).toBe(true)
      }
    }
  })

  it('never exceeds the ceiling, whatever the sample', () => {
    for (const sample of [0, 0.5, 1]) {
      expect(delay(50, sample)).toBeLessThanOrEqual(OPTIONS.maxMs)
    }
  })

  it('copes with a ceiling below the base interval', () => {
    const result = computeBackoffMs(5, { baseMs: 10_000, maxMs: 1_000, randomSample: 1 })
    expect(result).toBe(1_000)
  })
})
