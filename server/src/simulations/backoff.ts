/**
 * Retry pacing for the worker loop.
 *
 * Exponential with a ceiling and equal jitter: each consecutive failure doubles
 * the wait up to a cap, then a caller-supplied sample discounts it by up to half.
 * The jitter stops several workers that failed on the same outage from retrying
 * in lockstep afterwards.
 *
 * The random sample is a parameter rather than drawn here, which keeps this
 * function pure and its tests exact. It is operational scheduling only — nothing
 * in the simulation model depends on it, and simulation values remain derived
 * solely from their seed.
 */

/** The proportion of the delay that jitter may discount. */
export const BACKOFF_JITTER_RATIO = 0.5

export interface BackoffOptions {
  /** Wait after the first failure. */
  baseMs: number
  /** Ceiling the exponential growth stops at. */
  maxMs: number
  /** A sample in [0, 1). Defaults to 1, the undiscounted delay. */
  randomSample?: number
}

function clampSample(sample: number | undefined): number {
  if (sample === undefined || Number.isNaN(sample)) return 1
  return Math.min(Math.max(sample, 0), 1)
}

export function computeBackoffMs(attempt: number, options: BackoffOptions): number {
  const safeAttempt = Number.isFinite(attempt) && attempt > 1 ? attempt : 1

  // Cap before anything else: 2 ** 2000 is Infinity, and every later step would
  // inherit it.
  const exponential = Math.min(options.baseMs * 2 ** (safeAttempt - 1), options.maxMs)

  const sample = clampSample(options.randomSample)
  const discounted = exponential * (1 - BACKOFF_JITTER_RATIO + BACKOFF_JITTER_RATIO * sample)

  return Math.round(discounted)
}
