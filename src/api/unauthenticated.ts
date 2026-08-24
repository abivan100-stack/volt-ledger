/**
 * A one-slot registry the session layer uses to learn that the server rejected a
 * cookie as unauthenticated.
 *
 * The API layer must not import the store — the store already imports the API
 * layer, and a direct call back would close that cycle. So the client announces
 * 401s here and the session store subscribes, keeping the dependency one-way.
 */

type UnauthenticatedHandler = () => void

const handlers = new Set<UnauthenticatedHandler>()

/** Registers a handler. Multiple subscribers are supported. Returns an unsubscribe. */
export function setUnauthenticatedHandler(next: UnauthenticatedHandler | null): () => void {
  if (next) {
    if (handlers.has(next)) {
      // Already registered
    } else {
      if (handlers.size > 0) {
        console.warn('Multiple unauthenticated handlers registered')
      }
      handlers.add(next)
    }
    return () => {
      handlers.delete(next)
    }
  }
  return () => {}
}

/** Announces that the server rejected the current session. */
export function notifyUnauthenticated(): void {
  for (const handler of [...handlers]) {
    try {
      handler()
    } catch {
      // Session bookkeeping must never turn into a second failure for the caller,
      // who is already handling the original 401.
    }
  }
}
