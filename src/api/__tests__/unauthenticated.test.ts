import { afterEach, describe, expect, it, vi } from 'vitest'
import { notifyUnauthenticated, setUnauthenticatedHandler } from '../unauthenticated'

afterEach(() => {
  setUnauthenticatedHandler(null)
})

describe('setUnauthenticatedHandler', () => {
  it('invokes the registered handler', () => {
    const handler = vi.fn()
    setUnauthenticatedHandler(handler)
    notifyUnauthenticated()
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('returns an unsubscribe that stops further notifications', () => {
    const handler = vi.fn()
    const unsubscribe = setUnauthenticatedHandler(handler)
    unsubscribe()
    notifyUnauthenticated()
    expect(handler).not.toHaveBeenCalled()
  })

  it('does nothing when no handler is registered', () => {
    expect(() => notifyUnauthenticated()).not.toThrow()
  })

  it('replaces a previously registered handler', () => {
    const first = vi.fn()
    const second = vi.fn()
    setUnauthenticatedHandler(first)
    setUnauthenticatedHandler(second)
    notifyUnauthenticated()
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('does not let a failing handler break the caller', () => {
    setUnauthenticatedHandler(() => {
      throw new Error('handler exploded')
    })
    expect(() => notifyUnauthenticated()).not.toThrow()
  })
})
