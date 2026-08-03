/**
 * Shared easing curves, previously duplicated across the animated-number
 * hook, the spread tween, and both canvas engines. Pure functions — lib-safe.
 */

/** Cubic ease-out, t in [0,1]. */
export function cubicEaseOut(t: number): number {
  return 1 - (1 - t) ** 3
}

/** Symmetric ease-in-out (cubic in first half, cubic-out second half), t in [0,1]. */
export function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
}
