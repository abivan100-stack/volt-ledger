// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useScrollReveal } from '../useScrollReveal'

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = []
  callback: IntersectionObserverCallback
  observed: Element[] = []
  disconnected = false

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback
    MockIntersectionObserver.instances.push(this)
  }

  observe(target: Element): void {
    this.observed.push(target)
  }

  unobserve(target: Element): void {
    this.observed = this.observed.filter((element) => element !== target)
  }

  disconnect(): void {
    this.disconnected = true
    MockIntersectionObserver.instances = MockIntersectionObserver.instances.filter((instance) => instance !== this)
  }

  trigger(target: Element, isIntersecting: boolean): void {
    act(() => {
      this.callback(
        [{ target, isIntersecting } as IntersectionObserverEntry],
        this as unknown as IntersectionObserver,
      )
    })
  }
}

beforeEach(() => {
  MockIntersectionObserver.instances = []
  vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useScrollReveal', () => {
  it('adds rv-in to reveal elements that become visible', () => {
    const container = document.createElement('div')
    container.innerHTML = '<div data-reveal></div><div data-reveal></div><div></div>'
    const revealElements = Array.from(container.querySelectorAll('[data-reveal]'))

    renderHook(() => useScrollReveal({ current: container }, 0.2))

    const observer = MockIntersectionObserver.instances[0]
    expect(observer).toBeDefined()
    expect(observer.observed).toEqual(revealElements)

    observer.trigger(revealElements[0], true)
    expect(revealElements[0].classList.contains('rv-in')).toBe(true)
    expect(revealElements[1].classList.contains('rv-in')).toBe(false)
    expect(observer.observed).not.toContain(revealElements[0])
  })

  it('leaves elements untouched while they stay out of view', () => {
    const container = document.createElement('div')
    container.innerHTML = '<div data-reveal></div>'
    const revealElement = container.querySelector('[data-reveal]') as HTMLElement

    renderHook(() => useScrollReveal({ current: container }, 0.2))
    const observer = MockIntersectionObserver.instances[0]

    observer.trigger(revealElement, false)
    expect(revealElement.classList.contains('rv-in')).toBe(false)
  })

  it('does not create an observer without reveal elements', () => {
    const container = document.createElement('div')
    renderHook(() => useScrollReveal({ current: container }, 0.2))
    expect(MockIntersectionObserver.instances).toHaveLength(0)
  })

  it('does not create an observer without a container', () => {
    renderHook(() => useScrollReveal({ current: null }, 0.2))
    expect(MockIntersectionObserver.instances).toHaveLength(0)
  })

  it('disconnects the observer on unmount', () => {
    const container = document.createElement('div')
    container.innerHTML = '<div data-reveal></div>'
    const { unmount } = renderHook(() => useScrollReveal({ current: container }, 0.2))

    const observer = MockIntersectionObserver.instances[0]
    unmount()
    expect(observer.disconnected).toBe(true)
  })
})
