import { useEffect } from 'react'
import { isActiveRun, useSimulationStore } from '../store/useSimulationStore'

/** How often to ask the API about runs the worker has not finished yet. */
export const SIMULATION_POLL_INTERVAL_MS = 4_000

/**
 * Polls runs that are still queued or running, and stops as soon as none are.
 *
 * Runs are executed by a separate worker, so there is nothing to await after
 * submitting one — the client has to ask. The poll is deliberately bounded by
 * whether any run is actually moving, so an idle organisation issues no traffic.
 */
export function useSimulationPolling(intervalMs: number = SIMULATION_POLL_INTERVAL_MS): void {
  const hasActiveRun = useSimulationStore((state) => state.runs.some(isActiveRun))

  useEffect(() => {
    if (!hasActiveRun) return

    let cancelled = false
    const timer = setInterval(() => {
      if (cancelled) return
      void useSimulationStore.getState().refreshActiveRuns()
    }, intervalMs)

    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [hasActiveRun, intervalMs])
}
