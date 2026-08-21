import { describe, expect, it } from 'vitest'
import {
  PURGEABLE_COLLECTIONS,
  RETAINED_COLLECTIONS,
  isRecoverable,
  purgeCutoff,
  recoverableForMs,
} from './policy.js'

/**
 * The boundary is the whole point: one side is recoverable, the other is gone.
 */

const NOW = new Date('2030-06-01T00:00:00.000Z')
const WINDOW = 30
const DAY = 24 * 60 * 60 * 1000

describe('purgeCutoff', () => {
  it('is the window measured back from now', () => {
    expect(purgeCutoff(NOW, WINDOW).toISOString()).toBe('2030-05-02T00:00:00.000Z')
  })

  it('moves with the window', () => {
    expect(purgeCutoff(NOW, 7).toISOString()).toBe('2030-05-25T00:00:00.000Z')
  })
})

describe('isRecoverable', () => {
  it('keeps a recent archive recoverable', () => {
    expect(isRecoverable(new Date(NOW.getTime() - DAY), NOW, WINDOW)).toBe(true)
  })

  it('drops one that has passed the window', () => {
    expect(isRecoverable(new Date(NOW.getTime() - 31 * DAY), NOW, WINDOW)).toBe(false)
  })

  it('treats the boundary itself as past', () => {
    // Exactly at the cutoff is eligible for purge, so it must not also be
    // offered as recoverable — the two must never both be true.
    const atCutoff = purgeCutoff(NOW, WINDOW)
    expect(isRecoverable(atCutoff, NOW, WINDOW)).toBe(false)
  })

  it('says a live organisation is not recoverable, because it was never archived', () => {
    expect(isRecoverable(null, NOW, WINDOW)).toBe(false)
  })
})

describe('recoverableForMs', () => {
  it('reports what is left of the window', () => {
    expect(recoverableForMs(new Date(NOW.getTime() - 10 * DAY), NOW, WINDOW)).toBe(20 * DAY)
  })

  it('never reports a negative remainder', () => {
    expect(recoverableForMs(new Date(NOW.getTime() - 99 * DAY), NOW, WINDOW)).toBe(0)
  })

  it('is zero for something never archived', () => {
    expect(recoverableForMs(null, NOW, WINDOW)).toBe(0)
  })
})

describe('what the policy touches', () => {
  it('purges only the replayable synthetic output', () => {
    expect([...PURGEABLE_COLLECTIONS]).toEqual([
      'simulationIntervals',
      'simulationSummaries',
      'simulationRuns',
    ])
  })

  it('never purges evidence or the rows that evidence references', () => {
    // Ledger events are hash-linked; audit events are the record of who acted;
    // organisation and membership rows are what both of those point at.
    for (const retained of ['ledgerEvents', 'auditEvents', 'organisations', 'memberships']) {
      expect(RETAINED_COLLECTIONS).toContain(retained)
      expect(PURGEABLE_COLLECTIONS as readonly string[]).not.toContain(retained)
    }
  })
})
