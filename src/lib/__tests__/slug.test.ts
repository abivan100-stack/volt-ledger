import { describe, it, expect } from 'vitest'
import { MAX_SLUG_LENGTH, MIN_SLUG_LENGTH, isValidSlug, toSlug } from '../slug'

describe('toSlug', () => {
  it('lower-cases and hyphenates a name', () => {
    expect(toSlug('Nolambur Microgrid')).toBe('nolambur-microgrid')
  })

  it('collapses runs of punctuation and whitespace into one hyphen', () => {
    expect(toSlug('Ashok   Nagar!! / Block  B')).toBe('ashok-nagar-block-b')
  })

  it('trims leading and trailing separators', () => {
    expect(toSlug('  --Nolambur--  ')).toBe('nolambur')
  })

  it('keeps digits', () => {
    expect(toSlug('Sector 7 Grid')).toBe('sector-7-grid')
  })

  it('strips diacritics rather than dropping the letter', () => {
    expect(toSlug('Café Nagar')).toBe('cafe-nagar')
  })

  it('returns an empty string when nothing usable remains', () => {
    expect(toSlug('   ')).toBe('')
    expect(toSlug('---')).toBe('')
    expect(toSlug('!!!')).toBe('')
  })

  it('truncates to the maximum length without leaving a trailing hyphen', () => {
    const slug = toSlug(`${'a'.repeat(63)} bbbb`)
    expect(slug.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH)
    expect(slug.endsWith('-')).toBe(false)
  })

  it('always produces a slug the server would accept, when it produces one at all', () => {
    for (const name of ['Nolambur Microgrid', 'Sector 7', 'Café  Nagar!!', 'a'.repeat(200)]) {
      const slug = toSlug(name)
      if (slug.length >= MIN_SLUG_LENGTH) expect(isValidSlug(slug)).toBe(true)
    }
  })
})

describe('isValidSlug', () => {
  it('accepts lower-case hyphen-separated words', () => {
    expect(isValidSlug('nolambur')).toBe(true)
    expect(isValidSlug('nolambur-microgrid')).toBe(true)
    expect(isValidSlug('sector-7-grid')).toBe(true)
  })

  it('rejects anything shorter than the minimum', () => {
    expect(isValidSlug('ab')).toBe(false)
    expect(isValidSlug('')).toBe(false)
  })

  it('rejects anything longer than the maximum', () => {
    expect(isValidSlug('a'.repeat(MAX_SLUG_LENGTH + 1))).toBe(false)
  })

  it('rejects upper case, spaces and leading or trailing hyphens', () => {
    expect(isValidSlug('Nolambur')).toBe(false)
    expect(isValidSlug('nolambur microgrid')).toBe(false)
    expect(isValidSlug('-nolambur')).toBe(false)
    expect(isValidSlug('nolambur-')).toBe(false)
    expect(isValidSlug('nolambur--microgrid')).toBe(false)
  })
})
