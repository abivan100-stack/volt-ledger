import { lazy, Suspense, useEffect } from 'react'
import { Route, Routes } from 'react-router-dom'
import { useEnergyStore } from './store/useEnergyStore'
import { usePauseSimOnHidden } from './hooks/usePauseSimOnHidden'
import VoltPage from './pages/VoltPage'
import './App.css'

const LedgerPage = lazy(() => import('./pages/LedgerPage'))

function App() {
  usePauseSimOnHidden()

  useEffect(() => {
    useEnergyStore.getState().start()
    return () => useEnergyStore.getState().stop()
  }, [])

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
