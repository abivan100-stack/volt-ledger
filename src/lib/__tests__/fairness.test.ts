import { describe, it, expect } from 'vitest'
import { netBenefit, fairnessSummary } from '../fairness'

describe('netBenefit', () => {
  it('returns earned minus spent', () => {
    expect(netBenefit({ name: 'A', earned: 100, spent: 30 })).toBe(70)
  })

  it('returns negative when spent exceeds earned', () => {
    expect(netBenefit({ name: 'A', earned: 10, spent: 50 })).toBe(-40)
  })

  it('returns zero when equal', () => {
    expect(netBenefit({ name: 'A', earned: 50, spent: 50 })).toBe(0)
  })
})

describe('fairnessSummary', () => {
  it('identifies best and worst households', () => {
    const households = [
      { name: 'A', earned: 100, spent: 10 },
      { name: 'B', earned: 30, spent: 50 },
      { name: 'C', earned: 60, spent: 30 },
    ]
    const summary = fairnessSummary(households)
    expect(summary.best.name).toBe('A')
    expect(summary.worst.name).toBe('B')
    expect(summary.spread).toBe(110)
  })

  it('returns ratio 1 when all households have equal net benefit', () => {
    const households = [
      { name: 'A', earned: 50, spent: 0 },
      { name: 'B', earned: 50, spent: 0 },
    ]
    const summary = fairnessSummary(households)
    expect(summary.ratio).toBe(1)
  })

  it('returns null ratio when worst household earned nothing', () => {
    const households = [
      { name: 'A', earned: 100, spent: 0 },
      { name: 'B', earned: 0, spent: 50 },
    ]
    const summary = fairnessSummary(households)
    expect(summary.ratio).toBeNull()
  })

  it('returns null ratio when worst net benefit is negative', () => {
    const households = [
      { name: 'A', earned: 100, spent: 0 },
      { name: 'B', earned: 10, spent: 50 },
    ]
    const summary = fairnessSummary(households)
    expect(summary.ratio).toBeNull()
  })

  it('returns zero spread when all equal', () => {
    const households = [
      { name: 'A', earned: 50, spent: 0 },
      { name: 'B', earned: 50, spent: 0 },
    ]
    const summary = fairnessSummary(households)
    expect(summary.spread).toBe(0)
  })

  it('handles single household', () => {
    const households = [{ name: 'A', earned: 50, spent: 10 }]
    const summary = fairnessSummary(households)
    expect(summary.best.name).toBe('A')
    expect(summary.worst.name).toBe('A')
    expect(summary.spread).toBe(0)
    expect(summary.ratio).toBe(1)
  })

  it('handles negative net benefits', () => {
    const households = [
      { name: 'A', earned: 0, spent: 100 },
      { name: 'B', earned: 0, spent: 50 },
    ]
    const summary = fairnessSummary(households)
    expect(summary.best.name).toBe('B')
    expect(summary.worst.name).toBe('A')
    expect(summary.spread).toBe(50)
  })

  it('returns all households in the summary', () => {
    const households = [
      { name: 'A', earned: 100, spent: 0 },
      { name: 'B', earned: 50, spent: 0 },
    ]
    const summary = fairnessSummary(households)
    expect(summary.households).toHaveLength(2)
    expect(summary.households.map((h) => h.name).sort()).toEqual(['A', 'B'])
  })
})
