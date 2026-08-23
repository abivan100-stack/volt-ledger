import { useEffect, useState, useRef, useCallback } from 'react'
import { Zap, Play, Pause, X, ChevronLeft, ChevronRight } from 'lucide-react'
import { useEnergyStore } from '../../store/useEnergyStore'
import { scrollToId } from '../../utils/scrollToId'
import type { DayType } from '../../lib/simulation'
import './JudgeTour.css'

interface TourStep {
  title: string
  subtitle: string
  body: string
  badge: string
  targetId: string
  setup: () => void
}

interface JudgeTourProps {
  isOpen: boolean
  onClose: () => void
}

const AUTO_ADVANCE_MS = 9000

function JudgeTour({ isOpen, onClose }: JudgeTourProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const previousState = useRef<{ dayType: string; simMinute: number; running: boolean } | null>(null)

  const steps: TourStep[] = [
    {
      badge: 'STEP 1 · SOLAR PEAK',
      title: 'Solar Peak in Nolambur (12:30 PM)',
      subtitle: 'Surplus generation meets neighborhood demand',
      body: 'At midday, rooftop solar generation reaches peak capacity (+3.4 kW). Pranav has excess green energy, while Abivan (a tenant with no roof) is running appliances.',
      targetId: 'energy-network',
      setup: () => {
        useEnergyStore.getState().restoreChain()
        useEnergyStore.setState({ dayType: 'sunny-weekday', simMinute: 750 })
        useEnergyStore.getState().start()
      },
    },
    {
      badge: 'STEP 2 · P2P EXCHANGE',
      title: 'Direct Peer-to-Peer Trading',
      subtitle: 'Fair community tariffs replace utility monopoly',
      body: 'Instead of dumping surplus to the grid for ₹3.10 feed-in credits, Pranav sells 1.15 kWh directly to Abivan at ₹5.50/kWh — saving Abivan 35% while giving Pranav 77% higher revenue.',
      targetId: 'energy-network',
      setup: () => {
        useEnergyStore.getState().restoreChain()
        useEnergyStore.setState({ simMinute: 780 })
      },
    },
    {
      badge: 'STEP 3 · IMMUTABLE LEDGER',
      title: 'Cryptographic SHA-256 Ledger',
      subtitle: 'Mathematical trust without central middlemen',
      body: 'Every trade is sealed into an append-only cryptographic block linked to the previous seal: SHA256(prevHash + payload). Energy transfers and rupee credits settle instantaneously.',
      targetId: 'chain-ledger',
      setup: () => {
        useEnergyStore.getState().restoreChain()
      },
    },
    {
      badge: 'STEP 4 · SECURITY DEMO',
      title: 'Real-Time Tamper Detection',
      subtitle: 'Loud cryptographic failure on forged data',
      body: 'Watch what happens when historical data is altered: the entire downstream chain breaks immediately with an INTEGRITY VOID alert. Fraud is mathematically impossible to conceal.',
      targetId: 'chain-ledger',
      setup: () => {
        useEnergyStore.getState().runTamperTest()
      },
    },
    {
      badge: 'STEP 5 · COMMUNITY IMPACT',
      title: 'Self-Healing & 92% Street Autonomy',
      subtitle: 'Transparent, decentralized urban microgrids',
      body: 'Restoring the authentic cryptographic chain clears the alarm. Volt enables high street autonomy, verified carbon offsets, and equitable access for all residents.',
      targetId: 'main',
      setup: () => {
        useEnergyStore.getState().restoreChain()
      },
    },
  ]

  // Save previous state on open, restore on close
  useEffect(() => {
    if (isOpen) {
      setIsPlaying(false)
      previousState.current = {
        dayType: useEnergyStore.getState().dayType,
        simMinute: useEnergyStore.getState().simMinute,
        running: useEnergyStore.getState().running,
      }
      setCurrentStep(0)
      steps[0]?.setup()
      scrollToId(steps[0]?.targetId || 'main')
    } else if (previousState.current) {
      setIsPlaying(false)
      useEnergyStore.getState().restoreChain()
      useEnergyStore.setState({
        dayType: previousState.current.dayType as DayType,
        simMinute: previousState.current.simMinute,
      })
      if (previousState.current.running) {
        useEnergyStore.getState().start()
      } else {
        useEnergyStore.getState().stop()
      }
    }
    // eslint-disable-next-line react/exhaustive-deps
  }, [isOpen])

  // Execute step setup on step change
  useEffect(() => {
    if (!isOpen) return
    const step = steps[currentStep]
    if (step) {
      step.setup()
      if (step.targetId) {
        scrollToId(step.targetId)
      }
    }
    // eslint-disable-next-line react/exhaustive-deps
  }, [currentStep, isOpen])

  const handleNext = useCallback(() => {
    if (currentStep < steps.length - 1) {
      setCurrentStep((prev) => prev + 1)
    } else {
      setIsPlaying(false)
      onClose()
    }
  }, [currentStep, steps.length, onClose])

  const handlePrev = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1)
    }
  }, [currentStep])

  // Auto-play interval
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
        onClose()
      } else if (e.key === 'ArrowRight') {
        handleNext()
      } else if (e.key === 'ArrowLeft') {
        handlePrev()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, handleNext, handlePrev, onClose])

  if (!isOpen) return null

  const step = steps[currentStep]

  return (
    <div className="judge-tour-overlay" role="dialog" aria-modal="true" aria-label="60-Second Guided Tour">
      <div className="judge-tour-card">
        <div className="judge-tour-header">
          <div className="judge-tour-badge-row">
            <span className="mono judge-tour-badge">
              <Zap className="judge-tour-bolt" aria-hidden="true" />
              {step.badge}
            </span>
            <span className="mono judge-tour-counter">
              {currentStep + 1} / {steps.length}
            </span>
          </div>
          <button
            type="button"
            className="judge-tour-close"
            aria-label="Exit tour"
            onClick={onClose}
          >
            <X className="judge-tour-x" aria-hidden="true" />
          </button>
        </div>

        <div className="judge-tour-content">
          <h3 className="serif judge-tour-title">{step.title}</h3>
          <h4 className="mono judge-tour-sub">{step.subtitle}</h4>
          <p className="judge-tour-body">{step.body}</p>
        </div>

        <div className="judge-tour-footer">
          <div className="judge-tour-progress-dots">
            {steps.map((_, idx) => (
              <button
                key={idx}
                type="button"
                className={`judge-tour-dot${idx === currentStep ? ' judge-tour-dot-active' : ''}`}
                onClick={() => setCurrentStep(idx)}
                aria-label={`Go to step ${idx + 1}`}
              />
            ))}
          </div>

          <div className="judge-tour-actions">
            <button
              type="button"
              className="mono judge-tour-autoplay"
              onClick={() => setIsPlaying((p) => !p)}
              aria-label={isPlaying ? 'Pause auto-play' : 'Start auto-play'}
            >
              {isPlaying ? <Pause className="judge-tour-icon-sm" /> : <Play className="judge-tour-icon-sm" />}
              {isPlaying ? 'PAUSE' : 'AUTO-PLAY'}
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
        </div>
      </div>
    </div>
  )
}

export default JudgeTour
