import { describe, it, expect } from 'vitest'
import { formatMoney, formatClock, shortHash } from '../format'

describe('formatMoney', () => {
  it('formats positive amount with INR symbol', () => {
    const result = formatMoney(1240.4)
    expect(result).toContain('₹')
    expect(result).toContain('1,240.40')
  })

  it('uses minus sign for negative amounts', () => {
    const result = formatMoney(-484.2)
    expect(result.startsWith('−')).toBe(true)
    expect(result).not.toContain('-')
  })

  it('formats zero', () => {
    const result = formatMoney(0)
    expect(result).toContain('0.00')
  })

  it('formats small amounts', () => {
    const result = formatMoney(0.5)
    expect(result).toContain('0.50')
  })

  it('formats large amounts', () => {
    const result = formatMoney(99999.99)
    expect(result).toContain('99,999.99')
  })
})

describe('formatClock', () => {
  it('wraps negative minutes onto the preceding day', () => {
    expect(formatClock(-42)).toBe('23:18')
  })

  it('formats midnight', () => {
    expect(formatClock(0)).toBe('00:00')
  })

  it('formats noon', () => {
    expect(formatClock(720)).toBe('12:00')
  })

  it('formats afternoon', () => {
    expect(formatClock(842)).toBe('14:02')
  })

  it('wraps past midnight', () => {
    expect(formatClock(1440)).toBe('00:00')
  })

  it('pads single-digit hours and minutes', () => {
    expect(formatClock(1)).toBe('00:01')
    expect(formatClock(60)).toBe('01:00')
  })

  it('handles fractional minutes', () => {
    expect(formatClock(450.5)).toBe('07:30')
  })
})

describe('shortHash', () => {
  it('returns first 10 characters by default', () => {
    const hash = 'abcdef0123456789'
    expect(shortHash(hash)).toBe('abcdef0123')
  })

  it('returns specified length', () => {
    const hash = 'abcdef0123456789'
    expect(shortHash(hash, 6)).toBe('abcdef')
  })

  it('returns full string if shorter than length', () => {
    const hash = 'abc'
    expect(shortHash(hash, 10)).toBe('abc')
  })
})
