/**
 * Who the browser is, as far as the demo store is concerned.
 *
 * The public demo has no account. What gives a visitor their own history is a
 * random identifier kept in `localStorage`: it survives a reload, so the ledger
 * they built is still there when they come back, and it identifies nothing about
 * them. Losing it — a cleared browser, a private window — costs them their
 * history and nothing else, which is the right trade for something nobody signed
 * up for.
 *
 * A *run* identifier is deliberately not persisted. A new one is minted every
 * time the scenario resets, because a reset restarts the simulated day count at
 * one; without it, day 1 of a fresh run and day 1 of the previous one would be
 * the same day.
 */

const STORAGE_KEY = 'volt.demo.sessionId'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Set when storage is unavailable, so the tab still gets a usable identity. */
let fallbackSessionId: string | null = null

function randomUuid(): string {
  const globalCrypto = globalThis.crypto
  if (globalCrypto && typeof globalCrypto.randomUUID === 'function') {
    return globalCrypto.randomUUID()
  }

  // `randomUUID` needs a secure context, which a plain-HTTP kiosk build may not
  // be. `getRandomValues` has no such requirement, so build a v4 by hand.
  const bytes = new Uint8Array(16)
  globalCrypto.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/**
 * Reads a stored identifier, ignoring anything that is not a UUID.
 *
 * The server accepts UUIDs only, so a value left over from another build — or
 * edited by hand — must be replaced rather than sent and rejected on every
 * flush for the rest of the session.
 */
function readStored(): string | null {
  try {
    const stored = globalThis.localStorage?.getItem(STORAGE_KEY)
    return stored && UUID_PATTERN.test(stored) ? stored : null
  } catch {
    // Storage can throw outright when cookies are blocked, not merely return null.
    return null
  }
}

function writeStored(sessionId: string): boolean {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, sessionId)
    return true
  } catch {
    return false
  }
}

/**
 * This browser's demo session identifier, creating one on first use.
 *
 * Never throws: a visitor with storage disabled gets an identifier that lasts
 * as long as the tab, so their simulation is still recorded and still theirs
 * for as long as they are looking at it.
 */
export function demoSessionId(): string {
  const stored = readStored()
  if (stored) return stored
  if (fallbackSessionId) return fallbackSessionId

  const created = randomUuid()
  if (!writeStored(created)) fallbackSessionId = created
  return created
}

/** A fresh run identifier. Minted per scenario reset and never persisted. */
export function newDemoRunId(): string {
  return randomUuid()
}

/** Drops the identity. Exported for tests; nothing in the app calls it. */
export function forgetDemoSession(): void {
  fallbackSessionId = null
  try {
    globalThis.localStorage?.removeItem(STORAGE_KEY)
  } catch {
    // Nothing to clear if storage was never reachable.
  }
}
