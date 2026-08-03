import { useEffect } from 'react'
import { useEnergyStore } from '../store/useEnergyStore'

/**
 * Pauses the simulation loop when the tab is hidden and resumes it when the
 * tab becomes visible again — a hidden tab's requestAnimationFrame/setInterval
 * throttling otherwise skews tick cadence and burns CPU for no visible output.
 * The sim state itself (simMinute, chain, balances) is left untouched, so the
 * demo continues exactly where it stopped when the visitor comes back.
 */
export function usePauseSimOnHidden(): void {
  useEffect(() => {
    let wasRunning = false
    const handleVisibilityChange = () => {
      const store = useEnergyStore.getState()
      if (document.hidden) {
        wasRunning = store.running
        if (wasRunning) store.stop()
      } else if (wasRunning) {
        wasRunning = false
        store.start()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [])
}
