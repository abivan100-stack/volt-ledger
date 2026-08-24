import { describe, expect, it } from 'vitest'
import { demoDayTypes } from '../db/models.js'
import { SIMULATION_DAY_TYPES } from '../simulations/monteCarlo.js'

/**
 * `db/models.ts` imports nothing, so it restates the day-type vocabulary rather
 * than importing it from `simulations/`. This keeps the two copies identical —
 * a demo run recorded under a day type the Monte Carlo model does not know would
 * be a vocabulary split, not a feature.
 */
describe('demoDayTypes', () => {
  it('matches the Monte Carlo day types exactly', () => {
    expect([...demoDayTypes]).toEqual([...SIMULATION_DAY_TYPES])
  })
})
