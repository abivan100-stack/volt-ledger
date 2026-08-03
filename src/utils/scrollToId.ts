import { prefersReducedMotion } from './prefersReducedMotion'

/** Ported from the original prototype's `scrollTo(ref)` method, adapted to a
 * plain element id since sections no longer share one component tree to pass
 * refs through. Skips the URL hash change the browser's default anchor jump
 * would cause, matching the original's `preventDefault`-based behaviour. */
export function scrollToId(id: string): void {
  const target = document.getElementById(id)
  if (!target) return
  target.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' })
}
