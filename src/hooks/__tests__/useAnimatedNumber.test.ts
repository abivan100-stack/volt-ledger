// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useAnimatedNumber } from '../useAnimatedNumber'

vi.mock('../../utils/prefersReducedMotion', () => ({
  prefersReducedMotion: () => true,
}))

describe('useAnimatedNumber', () => {
  it('returns the target immediately when prefers-reduced-motion', () => {
    const { result } = renderHook(() => useAnimatedNumber(42, 1))
    expect(result.current).toBe(42)
  })

  it('snaps to a new target when it changes under reduced motion', () => {
    const { result, rerender } = renderHook(({ target }: { target: number }) => useAnimatedNumber(target, 1), {
      initialProps: { target: 10 },
    })
    expect(result.current).toBe(10)
    rerender({ target: 25 })
    expect(result.current).toBe(25)
  })

  it('starts at the target on first render', () => {
    const { result } = renderHook(() => useAnimatedNumber(7.5, 0.5))
    expect(result.current).toBe(7.5)
  })
})
