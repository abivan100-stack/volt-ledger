/**
 * Shared reduced-motion check. A plain function, not a hook: it's a one-shot
 * imperative read (matches how every call site already used it — checked once
 * at the moment an animation is about to start), so it can be called from
 * anywhere — component body, effect, or event handler — without Rules of
 * Hooks constraints. Does not subscribe to live OS-setting changes; adding
 * that would be a behavior change, not a refactor.
 */
export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
