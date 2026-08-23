import { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Play, Pause, X, ChevronLeft, ChevronRight, Compass } from 'lucide-react'
import { useEnergyStore } from '../../store/useEnergyStore'
import { useTourStore } from '../../store/useTourStore'
import { scrollToId } from '../../utils/scrollToId'
import type { DayType } from '../../lib/simulation'
import './JudgeTour.css'

interface TourStep {
  badge: string
  title: string
  subtitle: string
  body: string
  path: string
  targetId?: string
  setup: () => void
}

const AUTO_ADVANCE_MS = 10000

export function JudgeTour() {
  const isOpen = useTourStore((state) => state.isOpen)
  const openTour = useTourStore((state) => state.openTour)
  const closeTour = useTourStore((state) => state.closeTour)
  const navigate = useNavigate()
  const location = useLocation()

  const [currentStep, setCurrentStep] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const initialSnapshot = useRef<{
    dayType: string
    simMinute: number
    running: boolean
    pathname: string
  } | null>(null)

  const steps: TourStep[] = [
    {
      badge: '01 · VISION & GAP',
      title: 'The Local Solar Opportunity',
      subtitle: 'Home · Nolambur Microgrid Concept',
      body: 'In Nolambur, utilities pay solar owners only ₹3.10/kWh for grid export while charging neighbours ₹8.50/kWh. Volt turns the street into an automated P2P microgrid where neighbours trade directly at ₹5.50/kWh — saving consumers 35% while giving solar owners 77% higher revenue.',
      path: '/',
      setup: () => {
        useEnergyStore.getState().restoreChain()
        useEnergyStore.getState().closeDossier()
        useEnergyStore.setState({ dayType: 'sunny-weekday', simMinute: 750 })
        useEnergyStore.getState().start()
        window.scrollTo({ top: 0, behavior: 'smooth' })
      },
    },
    {
      badge: '02 · LIVE TELEMETRY',
      title: 'Real-Time Street Telemetry',
      subtitle: 'Ledger Overview · 10 Household Balance',
      body: 'The live Overview tracks energy generation, consumption, and battery storage across 10 households. Volt achieves 92% local street autonomy with automated rate adjustments. Evaluators can simulate different weather patterns (Cloudy, Heatwave, Weekend) to stress-test the grid.',
      path: '/ledger',
      setup: () => {
        useEnergyStore.getState().restoreChain()
        useEnergyStore.getState().closeDossier()
        window.scrollTo({ top: 0, behavior: 'smooth' })
      },
    },
    {
      badge: '03 · SITE PLAN',
      title: 'Interactive Neighbourhood Map',
      subtitle: 'Neighbourhood · Physical Bus & Dossiers',
      body: 'The Site Plan visualizes real-time power transfers across the shared 400V street bus. Notice Pranav’s live dossier: solar generators feed nearby tenants like Abivan in real time, with instant rupee credits accumulating in transparent household wallets.',
      path: '/ledger/neighbourhood',
      setup: () => {
        useEnergyStore.getState().restoreChain()
        useEnergyStore.getState().selectHouse(2)
        window.scrollTo({ top: 0, behavior: 'smooth' })
      },
    },
    {
      badge: '04 · SECURITY DEMO',
      title: 'Tamper-Evident SHA-256 Chain',
      subtitle: 'Settlement · Live Tamper Detection Demo',
      body: 'Every 15-minute trade is sealed into an append-only cryptographic block: SHA256(prevHash + payload). We just injected a simulated tamper into historical records — notice how downstream blocks immediately trigger a loud red INTEGRITY VOID alert!',
      path: '/ledger/settlement',
      setup: () => {
        useEnergyStore.getState().closeDossier()
        useEnergyStore.getState().runTamperTest()
        setTimeout(() => scrollToId('chain-ledger'), 80)
        setTimeout(() => scrollToId('chain-ledger'), 250)
      },
    },
    {
      badge: '05 · PROOF & FAIRNESS',
      title: 'Open Cryptographic Auditability',
      subtitle: 'Settlement · Self-Healing & Verification',
      body: 'Restoring authentic records instantly re-seals the chain back to verified green. Evaluators can inspect raw JSON payloads, recompute SHA-256 hashes live in the browser Proof Inspector, and verify mathematical Fairness Scores with zero trusted intermediaries.',
      path: '/ledger/settlement',
      setup: () => {
        useEnergyStore.getState().restoreChain()
        useEnergyStore.getState().closeDossier()
        setTimeout(() => scrollToId('chain-ledger'), 80)
        setTimeout(() => scrollToId('chain-ledger'), 250)
      },
    },
  ]

  // On tour open: snapshot initial state; on tour close: restore snapshot
  useEffect(() => {
    if (isOpen) {
      setIsPlaying(false)
      initialSnapshot.current = {
        dayType: useEnergyStore.getState().dayType,
        simMinute: useEnergyStore.getState().simMinute,
        running: useEnergyStore.getState().running,
        pathname: location.pathname,
      }
      setCurrentStep(0)
      steps[0]?.setup()
    } else if (initialSnapshot.current) {
      setIsPlaying(false)
      useEnergyStore.getState().restoreChain()
      useEnergyStore.getState().closeDossier()
      useEnergyStore.setState({
        dayType: initialSnapshot.current.dayType as DayType,
        simMinute: initialSnapshot.current.simMinute,
      })
      if (initialSnapshot.current.running) {
        useEnergyStore.getState().start()
      } else {
        useEnergyStore.getState().stop()
      }
    }
    // eslint-disable-next-line react/exhaustive-deps
  }, [isOpen])

  // On step change: navigate to path and execute setup
  useEffect(() => {
    if (!isOpen) return
    const step = steps[currentStep]
    if (step) {
      if (location.pathname !== step.path) {
        navigate(step.path)
      }
      step.setup()
    }
    // eslint-disable-next-line react/exhaustive-deps
  }, [currentStep, isOpen])

  const handleNext = useCallback(() => {
    if (currentStep < steps.length - 1) {
      setCurrentStep((prev) => prev + 1)
    } else {
      setIsPlaying(false)
      closeTour()
    }
  }, [currentStep, steps.length, closeTour])

  const handlePrev = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1)
    }
  }, [currentStep])

  // Auto-advance timer
  useEffect(() => {
    if (!isOpen || !isPlaying) return

    const timer = setTimeout(() => {
      handleNext()
    }, AUTO_ADVANCE_MS)

    return () => clearTimeout(timer)
  }, [isOpen, isPlaying, currentStep, handleNext])

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeTour()
      } else if (e.key === 'ArrowRight') {
        handleNext()
      } else if (e.key === 'ArrowLeft') {
        handlePrev()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, handleNext, handlePrev, closeTour])

  if (!isOpen) {
    return (
      <button
        type="button"
        className="mono judge-tour-launcher"
        onClick={openTour}
        aria-label="Start 60-Second Guided Tour for Evaluators"
      >
        <span className="judge-tour-launcher-dot" />
        <span>JUDGE TOUR · 60s</span>
      </button>
    )
  }

  const step = steps[currentStep]

  return (
    <aside
      className="judge-tour-dock"
      role="dialog"
      aria-modal="false"
      aria-label="60-Second Guided Judge Tour"
    >
      <div className="judge-tour-card">
        <header className="judge-tour-header">
          <div className="judge-tour-badge-row">
            <span className="mono judge-tour-badge">
              <span className="judge-tour-badge-dot" />
              {step.badge}
            </span>
            <span className="mono judge-tour-counter">
              STEP {currentStep + 1} OF {steps.length}
            </span>
          </div>
          <button
            type="button"
            className="judge-tour-close"
            aria-label="Exit Judge Tour"
            onClick={closeTour}
          >
            <X className="judge-tour-x" aria-hidden="true" />
          </button>
        </header>

        <main className="judge-tour-content">
          <div className="judge-tour-page-indicator">
            <Compass className="judge-tour-compass" aria-hidden="true" />
            <span className="mono judge-tour-page-label">{step.subtitle}</span>
          </div>
          <h3 className="serif judge-tour-title">{step.title}</h3>
          <p className="judge-tour-body">{step.body}</p>
        </main>

        <footer className="judge-tour-footer">
          <div className="judge-tour-progress-dots" role="tablist" aria-label="Tour steps">
            {steps.map((_, idx) => (
              <button
                key={idx}
                type="button"
                className={`judge-tour-dot${idx === currentStep ? ' judge-tour-dot-active' : ''}`}
                onClick={() => setCurrentStep(idx)}
                aria-label={`Go to tour step ${idx + 1}`}
                role="tab"
                aria-selected={idx === currentStep}
              />
            ))}
          </div>

          <div className="judge-tour-actions">
            <button
              type="button"
              className="mono judge-tour-autoplay"
              onClick={() => setIsPlaying((p) => !p)}
              aria-label={isPlaying ? 'Pause auto-advance' : 'Start auto-advance'}
            >
              {isPlaying ? <Pause className="judge-tour-icon-sm" /> : <Play className="judge-tour-icon-sm" />}
              {isPlaying ? 'PAUSE' : 'AUTO (10s)'}
            </button>

            {currentStep > 0 && (
              <button
                type="button"
                className="mono judge-tour-btn judge-tour-btn-prev"
                onClick={handlePrev}
              >
                <ChevronLeft className="judge-tour-icon-sm" />
                PREV
              </button>
            )}

            <button
              type="button"
              className="mono judge-tour-btn judge-tour-btn-next"
              onClick={handleNext}
            >
              {currentStep === steps.length - 1 ? 'FINISH' : 'NEXT'}
              {currentStep < steps.length - 1 && <ChevronRight className="judge-tour-icon-sm" />}
            </button>
          </div>
        </footer>
      </div>
    </aside>
  )
}

export default JudgeTour
