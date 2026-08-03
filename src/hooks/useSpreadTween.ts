import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { animateProgress } from '../utils/animateProgress'
import { prefersReducedMotion } from '../utils/prefersReducedMotion'

export type SpreadMode = 'today' | 'volt'
export type Tween = { sell: number; buy: number }

const TODAY_TARGETS: Tween = { sell: 3.0, buy: 8.0 }
const VOLT_TARGETS: Tween = { sell: 5.5, buy: 5.9 }
const TWEEN_DURATION_SECONDS = 0.85
const AUTO_SWITCH_DELAY_MS = 3600

export interface SpreadTweenState {
  mode: SpreadMode
  tween: Tween
  setMode: (mode: SpreadMode, isUserAction: boolean) => void
}

/**
 * Owns the Spread section's animated bars: tweens between TODAY_TARGETS and
 * VOLT_TARGETS, auto-plays the "with Volt" comparison once the section first
 * scrolls into view (unless the visitor has already toggled it manually),
 * and respects prefers-reduced-motion throughout. `containerRef` is the same
 * ref the caller also passes to `useScrollReveal` — this hook watches it with
 * its own, separate IntersectionObserver for a different purpose.
 */
export function useSpreadTween(containerRef: RefObject<HTMLDivElement>): SpreadTweenState {
  const [spreadMode, setSpreadMode] = useState<SpreadMode>('today')
  const [tween, setTweenState] = useState<Tween>({ sell: 0, buy: 0 })
  const tweenRef = useRef<Tween>(tween)
  const stopTweenRef = useRef<() => void>(() => {})
  const spreadSeenRef = useRef(false)
  const userToggledRef = useRef(false)
  const autoSwitchTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const setTween = useCallback((next: Tween) => {
    tweenRef.current = next
    setTweenState(next)
  }, [])

  const runTween = useCallback(
    (target: Tween, reducedMotion: boolean) => {
      stopTweenRef.current()
      const from = tweenRef.current
      if (reducedMotion) {
        setTween(target)
        return
      }
      stopTweenRef.current = animateProgress({
        durationSeconds: TWEEN_DURATION_SECONDS,
        onUpdate: (progress) => {
          setTween({
            sell: from.sell + (target.sell - from.sell) * progress,
            buy: from.buy + (target.buy - from.buy) * progress,
          })
        },
      })
    },
    [setTween],
  )

  const setMode = useCallback(
    (mode: SpreadMode, isUserAction: boolean) => {
      if (isUserAction) {
        userToggledRef.current = true
        clearTimeout(autoSwitchTimeoutRef.current)
      }
      setSpreadMode(mode)
      runTween(mode === 'today' ? TODAY_TARGETS : VOLT_TARGETS, prefersReducedMotion())
    },
    [runTween],
  )

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0]
      if (entry?.isIntersecting && !spreadSeenRef.current) {
        spreadSeenRef.current = true
        const reducedMotion = prefersReducedMotion()
        runTween(TODAY_TARGETS, reducedMotion)
        if (!reducedMotion) {
          autoSwitchTimeoutRef.current = setTimeout(() => {
            if (!userToggledRef.current) setMode('volt', false)
          }, AUTO_SWITCH_DELAY_MS)
        }
        observer.disconnect()
      }
    }, { threshold: 0.35 })

    observer.observe(container)
    return () => {
      observer.disconnect()
      clearTimeout(autoSwitchTimeoutRef.current)
      stopTweenRef.current()
    }
  }, [containerRef, runTween, setMode])

  return { mode: spreadMode, tween, setMode }
}
