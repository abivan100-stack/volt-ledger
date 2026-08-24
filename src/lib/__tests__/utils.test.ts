import { describe, it, expect } from 'vitest'
import { cn } from '../utils'

describe('cn (shadcn classNames utility)', () => {
  it('merges multiple plain class names', () => {
    expect(cn('volt-btn', 'px-4', 'py-2')).toBe('volt-btn px-4 py-2')
  })

  it('handles conditional and falsy values cleanly', () => {
    const isPrimary = true
    const isHidden = false
    expect(cn('btn', isPrimary && 'btn-primary', isHidden && 'hidden', null, undefined, false)).toBe(
      'btn btn-primary',
    )
  })

  it('properly resolves tailwind class conflicts with last wins precedence', () => {
    expect(cn('p-2 text-red-500', 'p-4 text-green-500')).toBe('p-4 text-green-500')
    expect(cn('bg-red-500', 'bg-blue-500')).toBe('bg-blue-500')
  })

  it('handles array and object syntax', () => {
    expect(cn(['foo', 'bar'], { baz: true, qux: false })).toBe('foo bar baz')
  })
})
