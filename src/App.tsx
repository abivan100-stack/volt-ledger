import { lazy, Suspense, useEffect } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { useEnergyStore } from './store/useEnergyStore'
import { usePauseSimOnHidden } from './hooks/usePauseSimOnHidden'
import VoltPage from './pages/VoltPage'
import './App.css'

const LedgerPage = lazy(() => import('./pages/LedgerPage'))

function App() {
  const location = useLocation()
  usePauseSimOnHidden()

  useEffect(() => {
    useEnergyStore.getState().start()
    return () => useEnergyStore.getState().stop()
  }, [])

  useEffect(() => {
    document.title =
      location.pathname === '/ledger' ? 'Volt Ledger — Live Energy Exchange' : 'Volt — Local Energy Ledger'
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
        </Routes>
      </Suspense>
    </>
  )
}

export default App
