import { cubicEaseOut } from '../lib/easing'

export interface AnimateProgressOptions {
  durationSeconds: number
  onUpdate: (progress: number) => void
}

/**
 * Lightweight rAF-based replacement for the subset of framer-motion's
 * `animate(0, 1, { duration, ease, onUpdate })` the app actually used: plays a
 * tween of progress 0→1 over `durationSeconds` with cubic ease-out, calling
 * `onUpdate` each frame with the eased progress, and returns a stop handle.
 * Callers map the eased progress onto their own value range. Respects nothing
 * itself — reduced-motion handling stays with the caller, as before.
 */
export function animateProgress(options: AnimateProgressOptions): () => void {
  const { durationSeconds, onUpdate } = options
  const start = performance.now()
  let frame = 0
  const step = (now: number) => {
    const t = Math.min((now - start) / (durationSeconds * 1000), 1)
    onUpdate(cubicEaseOut(t))
    if (t < 1) {
      frame = requestAnimationFrame(step)
    }
  }
  frame = requestAnimationFrame(step)
  return () => cancelAnimationFrame(frame)
}
