// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { demoSessionId, forgetDemoSession, newDemoRunId } from '../demoIdentity'

/**
 * The identity the demo store keys everything by.
 *
 * Its whole job is to be there. A visitor with cookies blocked, a stale value
 * from an older build, a browser without `crypto.randomUUID` — none of those may
 * end with the simulation unable to record anything, and none may end with an
 * identifier the server will reject on every request for the rest of the visit.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

beforeEach(() => {
  forgetDemoSession()
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
  forgetDemoSession()
  localStorage.clear()
})

describe('demoSessionId', () => {
  it('mints a UUID on first use', () => {
    expect(demoSessionId()).toMatch(UUID)
  })

  it('returns the same identifier on the next call', () => {
    expect(demoSessionId()).toBe(demoSessionId())
  })

  it('persists it, so a reload keeps the same history', () => {
    const first = demoSessionId()
    forgetDemoSession()
    localStorage.setItem('volt.demo.sessionId', first)

    expect(demoSessionId()).toBe(first)
  })

  it('replaces a stored value that is not a UUID', () => {
    // The server accepts UUIDs only; sending this would fail every flush.
    localStorage.setItem('volt.demo.sessionId', 'not-a-uuid')

    const sessionId = demoSessionId()
    expect(sessionId).toMatch(UUID)
    expect(localStorage.getItem('volt.demo.sessionId')).toBe(sessionId)
  })

  it('still returns an identifier when storage refuses to be read', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('access denied')
    })

    expect(demoSessionId()).toMatch(UUID)
  })

  it('keeps one identifier for the tab when storage refuses to be written', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })

    const first = demoSessionId()
    expect(first).toMatch(UUID)
    // Nothing was stored, so the value has to survive in memory instead.
    expect(demoSessionId()).toBe(first)
  })

  it('builds a v4 by hand when randomUUID is unavailable', () => {
    const original = globalThis.crypto.randomUUID
    Object.defineProperty(globalThis.crypto, 'randomUUID', {
      value: undefined,
      configurable: true,
    })

    try {
      expect(demoSessionId()).toMatch(UUID)
    } finally {
      Object.defineProperty(globalThis.crypto, 'randomUUID', {
        value: original,
        configurable: true,
      })
    }
  })
})

describe('newDemoRunId', () => {
  it('mints a UUID', () => {
    expect(newDemoRunId()).toMatch(UUID)
  })

  it('mints a different one every time, because a reset restarts day one', () => {
    expect(newDemoRunId()).not.toBe(newDemoRunId())
  })

  it('is not persisted, unlike the session', () => {
    newDemoRunId()
    expect(localStorage.getItem('volt.demo.sessionId')).toBeNull()
  })
})
