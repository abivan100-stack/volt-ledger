import { describe, it, expect } from 'vitest'
import { statusForNet, HOUSEHOLD_STATUSES } from '../householdStatus'

describe('statusForNet', () => {
  it('returns EXPORTING when net is above threshold', () => {
    expect(statusForNet(1.0)).toBe('EXPORTING')
    expect(statusForNet(0.16)).toBe('EXPORTING')
  })

  it('returns IMPORTING when net is below negative threshold', () => {
    expect(statusForNet(-1.0)).toBe('IMPORTING')
    expect(statusForNet(-0.16)).toBe('IMPORTING')
  })

  it('returns BALANCED when net is near zero', () => {
    expect(statusForNet(0)).toBe('BALANCED')
    expect(statusForNet(0.1)).toBe('BALANCED')
    expect(statusForNet(-0.1)).toBe('BALANCED')
    expect(statusForNet(0.14)).toBe('BALANCED')
    expect(statusForNet(-0.14)).toBe('BALANCED')
  })

  it('returns one of the valid statuses', () => {
    const result = statusForNet(1.0)
    expect(HOUSEHOLD_STATUSES).toContain(result)
  })
})
