import { describe, it, expect } from 'vitest'
import { cubicEaseOut, easeInOut } from '../easing'

describe('cubicEaseOut', () => {
  it('maps the domain endpoints exactly', () => {
    expect(cubicEaseOut(0)).toBe(0)
    expect(cubicEaseOut(1)).toBe(1)
  })

  it('is strictly monotonic', () => {
    for (let i = 0; i < 1000; i++) {
      const a = i / 1000
      const b = (i + 1) / 1000
      expect(cubicEaseOut(b)).toBeGreaterThan(cubicEaseOut(a))
    }
  })

  it('overshoots nothing and stays within [0, 1]', () => {
    for (let i = 0; i <= 1000; i++) {
      const v = cubicEaseOut(i / 1000)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
  })

  it('accelerates out of the origin', () => {
    expect(cubicEaseOut(0.1)).toBeCloseTo(0.271)
    expect(cubicEaseOut(0.5)).toBeCloseTo(0.875)
  })
})

describe('easeInOut', () => {
  it('maps the domain endpoints exactly', () => {
    expect(easeInOut(0)).toBe(0)
    expect(easeInOut(1)).toBe(1)
    expect(easeInOut(0.5)).toBeCloseTo(0.5)
  })

  it('is symmetric about the midpoint', () => {
    for (let i = 0; i <= 500; i++) {
      const t = i / 1000
      expect(easeInOut(t) + easeInOut(1 - t)).toBeCloseTo(1)
    }
  })

  it('is strictly monotonic', () => {
    for (let i = 0; i < 1000; i++) {
      const a = i / 1000
      const b = (i + 1) / 1000
      expect(easeInOut(b)).toBeGreaterThan(easeInOut(a))
    }
  })

  it('stays within [0, 1]', () => {
    for (let i = 0; i <= 1000; i++) {
      const v = easeInOut(i / 1000)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
  })
})
