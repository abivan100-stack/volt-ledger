// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { useAnimatedNumber } from '../useAnimatedNumber'
import { prefersReducedMotion } from '../../utils/prefersReducedMotion'

vi.mock('../../utils/prefersReducedMotion', () => ({
  prefersReducedMotion: vi.fn(() => true),
}))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.mocked(prefersReducedMotion).mockReturnValue(true)
})

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

  it('tweens from the previous target to the new target when it changes', () => {
    const callbacks: Array<(now: number) => void> = []
    let handle = 0
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callbacks.push(callback)
      return ++handle
    })
    vi.stubGlobal('cancelAnimationFrame', () => {})
    vi.mocked(prefersReducedMotion).mockReturnValue(false)

    const { result, rerender } = renderHook(({ target }: { target: number }) => useAnimatedNumber(target, 1), {
      initialProps: { target: 10 },
    })
    expect(result.current).toBe(10)

    callbacks.length = 0
    rerender({ target: 100 })

    let now = performance.now()
    for (let i = 0; i < 200 && callbacks.length > 0; i++) {
      now += 16
      const pending = callbacks.splice(0)
      act(() => pending.forEach((callback) => callback(now)))
    }
    expect(result.current).toBeCloseTo(100, 5)
  })
})
