import { lazy, Suspense, useEffect } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { useEnergyStore } from './store/useEnergyStore'
import { usePauseSimOnHidden } from './hooks/usePauseSimOnHidden'
import { useRestoreSession } from './hooks/useRestoreSession'
import { DAY_TYPES, type DayType } from './lib/simulation'
import VoltPage from './pages/VoltPage'
import NotFoundPage from './pages/NotFoundPage'
import AppLoading from './components/ui/AppLoading'
import { TradeNotificationFeed } from './components/sections/TradeNotificationFeed'
import { JudgeTour } from './components/sections/JudgeTour'
import './App.css'

const LedgerPage = lazy(() => import('./pages/LedgerPage'))
const NeighbourhoodPage = lazy(() => import('./pages/NeighbourhoodPage'))
const SettlementPage = lazy(() => import('./pages/SettlementPage'))
const ChainPage = lazy(() => import('./pages/ChainPage'))
const AccountPage = lazy(() => import('./pages/AccountPage'))
const InvitationAcceptPage = lazy(() => import('./pages/InvitationAcceptPage'))

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
  // Settles on `anonymous` without a network call when no API is configured,
  // so the browser-only demo below is unaffected.
  useRestoreSession()

  useEffect(() => {
    applyScenarioFromUrl(location.search)
    useEnergyStore.getState().start()
    return () => useEnergyStore.getState().stop()
    // Only the URL present at first mount should seed the scenario — later
    // navigation must not re-seed or restart the running simulation.
    // eslint-disable-next-line react/exhaustive-deps
  }, [])

  return (
    <>
      <a href="#main" className="mono skip-link">
        SKIP TO CONTENT
      </a>
      <Suspense
        fallback={<AppLoading />}
      >
        <Routes>
          <Route path="/" element={<VoltPage />} />
          <Route path="/ledger" element={<LedgerPage />} />
          <Route path="/ledger/neighbourhood" element={<NeighbourhoodPage />} />
          <Route path="/ledger/settlement" element={<SettlementPage />} />
          <Route path="/ledger/fairness" element={<SettlementPage />} />
          <Route path="/ledger/chain" element={<ChainPage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/invite/accept" element={<InvitationAcceptPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
      <TradeNotificationFeed />
      <JudgeTour />
    </>
  )
}

export default App
