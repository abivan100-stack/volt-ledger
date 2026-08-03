// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSpreadTween } from '../useSpreadTween'
import { prefersReducedMotion } from '../../utils/prefersReducedMotion'

vi.mock('../../utils/prefersReducedMotion', () => ({
  prefersReducedMotion: vi.fn(() => true),
}))

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = []
  callback: IntersectionObserverCallback

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback
    MockIntersectionObserver.instances.push(this)
  }

  observe(): void {}
  unobserve(): void {}

  disconnect(): void {
    MockIntersectionObserver.instances = MockIntersectionObserver.instances.filter((instance) => instance !== this)
  }

  trigger(isIntersecting: boolean): void {
    act(() => {
      this.callback(
        [{ isIntersecting } as IntersectionObserverEntry],
        this as unknown as IntersectionObserver,
      )
    })
  }
}

beforeEach(() => {
  MockIntersectionObserver.instances = []
  vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)
  vi.mocked(prefersReducedMotion).mockReturnValue(true)
  vi.useFakeTimers()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('useSpreadTween', () => {
  it('starts in today mode with a zero tween', () => {
    const container = document.createElement('div')
    const { result } = renderHook(() => useSpreadTween({ current: container }))
    expect(result.current.mode).toBe('today')
    expect(result.current.tween).toEqual({ sell: 0, buy: 0 })
  })

  it('snaps to the mode targets when prefers-reduced-motion', () => {
    const container = document.createElement('div')
    const { result } = renderHook(() => useSpreadTween({ current: container }))

    act(() => result.current.setMode('volt', true))
    expect(result.current.mode).toBe('volt')
    expect(result.current.tween).toEqual({ sell: 5.5, buy: 5.9 })

    act(() => result.current.setMode('today', true))
    expect(result.current.mode).toBe('today')
    expect(result.current.tween).toEqual({ sell: 3.0, buy: 8.0 })
  })

  it('observes the container once on mount', () => {
    const container = document.createElement('div')
    renderHook(() => useSpreadTween({ current: container }))
    expect(MockIntersectionObserver.instances).toHaveLength(1)
  })

  it('auto-plays to volt after the delay once the section is seen', () => {
    vi.mocked(prefersReducedMotion).mockReturnValue(false)
    const container = document.createElement('div')
    const { result } = renderHook(() => useSpreadTween({ current: container }))
    const observer = MockIntersectionObserver.instances[0]
    expect(observer).toBeDefined()

    observer.trigger(true)
    expect(result.current.mode).toBe('today')

    act(() => {
      vi.advanceTimersByTime(3600)
    })
    expect(result.current.mode).toBe('volt')
  })

  it('a manual toggle suppresses the auto-switch', () => {
    vi.mocked(prefersReducedMotion).mockReturnValue(false)
    const container = document.createElement('div')
    const { result } = renderHook(() => useSpreadTween({ current: container }))

    act(() => result.current.setMode('today', true))
    const observer = MockIntersectionObserver.instances[0]
    observer.trigger(true)

    act(() => {
      vi.advanceTimersByTime(3600)
    })
    expect(result.current.mode).toBe('today')
  })
})
