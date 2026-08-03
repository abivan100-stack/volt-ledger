import { useEffect, useRef, useState } from 'react'
import { animateProgress } from '../utils/animateProgress'
import { prefersReducedMotion } from '../utils/prefersReducedMotion'

/**
 * Tweens a display value toward `target` whenever it changes, respecting
 * prefers-reduced-motion (snaps instantly instead of animating). Starts at
 * `target` on first render — the first tween call ends up animating from
 * `target` to `target`, a no-op — so mount never animates from zero; only
 * subsequent changes to `target` animate.
 */
export function useAnimatedNumber(target: number, durationSeconds: number): number {
  const [display, setDisplay] = useState(target)
  const displayRef = useRef(target)
  const stopRef = useRef<() => void>(() => {})

  useEffect(() => {
    stopRef.current()
    if (prefersReducedMotion()) {
      displayRef.current = target
      setDisplay(target)
      return
    }
    const from = displayRef.current
    stopRef.current = animateProgress({
      durationSeconds,
      onUpdate: (progress) => {
        const value = from + (target - from) * progress
        displayRef.current = value
        setDisplay(value)
      },
    })
    return () => stopRef.current()
  }, [target, durationSeconds])

  return display
}
