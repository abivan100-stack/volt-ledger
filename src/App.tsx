import { useEffect } from 'react'
import { Route, Routes } from 'react-router-dom'
import { useEnergyStore } from './store/useEnergyStore'
import { usePauseSimOnHidden } from './hooks/usePauseSimOnHidden'
import VoltPage from './pages/VoltPage'
import LedgerPage from './pages/LedgerPage'

function App() {
  usePauseSimOnHidden()

  useEffect(() => {
    useEnergyStore.getState().start()
    return () => useEnergyStore.getState().stop()
  }, [])

  return (
    <Routes>
      <Route path="/" element={<VoltPage />} />
      <Route path="/ledger" element={<LedgerPage />} />
    </Routes>
  )
}

export default App
