/**
 * A one-slot registry the session layer uses to learn that the server rejected a
 * cookie as unauthenticated.
 *
 * The API layer must not import the store — the store already imports the API
 * layer, and a direct call back would close that cycle. So the client announces
 * 401s here and the session store subscribes, keeping the dependency one-way.
 */

type UnauthenticatedHandler = () => void

let handler: UnauthenticatedHandler | null = null

/** Registers the sole handler, replacing any previous one. Returns an unsubscribe. */
export function setUnauthenticatedHandler(next: UnauthenticatedHandler | null): () => void {
  if (handler && next && handler !== next) {
    console.warn('Unauthenticated handler replaced')
  }
  handler = next
  return () => {
    if (handler === next) handler = null
  }
}

/** Announces that the server rejected the current session. */
export function notifyUnauthenticated(): void {
  try {
    handler?.()
  } catch {
    // Session bookkeeping must never turn into a second failure for the caller,
    // who is already handling the original 401.
  }
}
