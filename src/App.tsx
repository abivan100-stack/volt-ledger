import { lazy, Suspense, useEffect } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { useEnergyStore } from './store/useEnergyStore'
import { usePauseSimOnHidden } from './hooks/usePauseSimOnHidden'
import { DAY_TYPES, type DayType } from './lib/simulation'
import VoltPage from './pages/VoltPage'
import './App.css'

const LedgerPage = lazy(() => import('./pages/LedgerPage'))
const NeighbourhoodPage = lazy(() => import('./pages/NeighbourhoodPage'))
const FairnessPage = lazy(() => import('./pages/FairnessPage'))
const ChainPage = lazy(() => import('./pages/ChainPage'))

/** Applies `?day=` and `?hour=` from a shared permalink before the sim's initial seed. Silently ignores anything invalid. */
function applyScenarioFromUrl(search: string): void {
  const params = new URLSearchParams(search)
  const dayParam = params.get('day')
  const dayType = DAY_TYPES.includes(dayParam as DayType) ? (dayParam as DayType) : undefined

  const hourParam = params.get('hour')
  const hour = hourParam === null ? NaN : Number(hourParam)
  const startHour = Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : undefined

  if (dayType === undefined && startHour === undefined) return
  useEnergyStore.setState((state) => ({
    dayType: dayType ?? state.dayType,
    config: startHour === undefined ? state.config : { ...state.config, startHour },
  }))
}

function App() {
  const location = useLocation()
  usePauseSimOnHidden()

  useEffect(() => {
    applyScenarioFromUrl(location.search)
    useEnergyStore.getState().start()
    return () => useEnergyStore.getState().stop()
    // Only the URL present at first mount should seed the scenario — later
    // navigation must not re-seed or restart the running simulation.
    // eslint-disable-next-line react/exhaustive-deps
  }, [])

  useEffect(() => {
    document.title = location.pathname.startsWith('/ledger')
      ? 'Volt Ledger — Live Energy Exchange'
      : 'Volt — Local Energy Ledger'
  }, [location.pathname])

  return (
    <>
      <a href="#main" className="mono skip-link">
        SKIP TO CONTENT
      </a>
      <Suspense
        fallback={
          <div className="container app-loading">
            <div className="mono">LOADING…</div>
          </div>
        }
      >
        <Routes>
          <Route path="/" element={<VoltPage />} />
          <Route path="/ledger" element={<LedgerPage />} />
          <Route path="/ledger/neighbourhood" element={<NeighbourhoodPage />} />
          <Route path="/ledger/fairness" element={<FairnessPage />} />
          <Route path="/ledger/chain" element={<ChainPage />} />
        </Routes>
      </Suspense>
    </>
  )
}

export default App
