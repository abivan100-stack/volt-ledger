import { describe, expect, it } from 'vitest'
import { isWithinRecoveryWindow, recoveryWindowLabel, wholeDaysUntil } from '../retention'

/**
 * The rounding is the whole point: this text is what someone reads before
 * deciding whether they still have time to undo an archive.
 */

const NOW = new Date('2030-06-01T12:00:00.000Z')
const DAY = 24 * 60 * 60 * 1000
const HOUR = 60 * 60 * 1000

function inHours(hours: number): Date {
  return new Date(NOW.getTime() + hours * HOUR)
}

describe('wholeDaysUntil', () => {
  it('counts whole days remaining', () => {
    expect(wholeDaysUntil(new Date(NOW.getTime() + 10 * DAY), NOW)).toBe(10)
  })

  it('floors a partial day rather than rounding it up', () => {
    // Nineteen hours is not a day. Saying it is would tell someone who has until
    // this evening that they can come back tomorrow.
    expect(wholeDaysUntil(inHours(19), NOW)).toBe(0)
    expect(wholeDaysUntil(inHours(47), NOW)).toBe(1)
  })

  it('never counts below zero', () => {
    expect(wholeDaysUntil(new Date(NOW.getTime() - 5 * DAY), NOW)).toBe(0)
  })
})

describe('isWithinRecoveryWindow', () => {
  it('is open while any time remains', () => {
    expect(isWithinRecoveryWindow(inHours(1), NOW)).toBe(true)
  })

  it('is closed at the deadline itself', () => {
    expect(isWithinRecoveryWindow(NOW, NOW)).toBe(false)
  })

  it('is closed after it', () => {
    expect(isWithinRecoveryWindow(inHours(-1), NOW)).toBe(false)
  })
})

describe('recoveryWindowLabel', () => {
  it('counts down in days', () => {
    expect(recoveryWindowLabel(new Date(NOW.getTime() + 29 * DAY), NOW)).toBe('29 days left')
  })

  it('does not pluralise a single day', () => {
    expect(recoveryWindowLabel(inHours(30), NOW)).toBe('1 day left')
  })

  it('says less than a day rather than zero', () => {
    // "0 days left" reads as gone to someone who still has hours to act.
    expect(recoveryWindowLabel(inHours(5), NOW)).toBe('Less than a day left')
  })

  it('says so once the window has closed', () => {
    expect(recoveryWindowLabel(inHours(-1), NOW)).toBe('Recovery window closed')
  })
})
