import { useEffect, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import {
  Play,
  Pause,
  ChevronRight,
  ChevronLeft,
  X,
  RotateCcw,
  ShieldAlert,
} from 'lucide-react'
import {
  useTourStore,
  TOUR_STEPS,
  TOTAL_TOUR_SECONDS,
} from '../../store/useTourStore'
import { useEnergyStore } from '../../store/useEnergyStore'
import { appendBlock } from '../../lib/hashChain'
import { Button } from '../ui/button'
import { Progress } from '../ui/progress'
import './JudgeTour.css'

export function JudgeTour() {
  const navigate = useNavigate()
  const location = useLocation()

  const isActive = useTourStore((s) => s.isActive)
  const isPaused = useTourStore((s) => s.isPaused)
  const currentStepIndex = useTourStore((s) => s.currentStepIndex)
  const totalRemainingSec = useTourStore((s) => s.totalRemainingSec)
  const stepRemainingSec = useTourStore((s) => s.stepRemainingSec)

  const startTour = useTourStore((s) => s.startTour)
  const stopTour = useTourStore((s) => s.stopTour)
  const pauseTour = useTourStore((s) => s.pauseTour)
  const resumeTour = useTourStore((s) => s.resumeTour)
  const nextStep = useTourStore((s) => s.nextStep)
  const prevStep = useTourStore((s) => s.prevStep)
  const goToStep = useTourStore((s) => s.goToStep)
  const tickSecond = useTourStore((s) => s.tickSecond)

  const currentStep = TOUR_STEPS[currentStepIndex] || TOUR_STEPS[0]
  const elapsedTotal = TOTAL_TOUR_SECONDS - totalRemainingSec
  const totalProgressPercent = (elapsedTotal / TOTAL_TOUR_SECONDS) * 100

  // Trigger tamper demonstration with block guarantee
  const handleTamperDemo = useCallback(() => {
    if (location.pathname !== '/ledger/settlement') {
      navigate('/ledger/settlement')
    }

    const storeState = useEnergyStore.getState()
    if (storeState.chain.length === 0) {
      const b1 = appendBlock([], 1, {
        t: '13:00',
        from: 'Prem Ramesh',
        to: 'Ananya Iyer',
        kwh: 1.45,
        credit: 7.25,
      })
      const b2 = appendBlock([b1], 2, {
        t: '13:15',
        from: 'Nikil Sundaram',
        to: 'Vikram Mehta',
        kwh: 0.95,
        credit: 4.75,
      })
      useEnergyStore.setState({ chain: [b1, b2] })
    }

    useEnergyStore.getState().runTamperTest()

    // Scroll to the ledger
    setTimeout(() => {
      const target = document.getElementById('chain-ledger')
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }, 100)
  }, [location.pathname, navigate])

  // 1-second interval timer when active
  useEffect(() => {
    if (!isActive) return
    const timer = setInterval(() => {
      tickSecond()
    }, 1000)
    return () => clearInterval(timer)
  }, [isActive, tickSecond])

  // Auto-navigate and scroll smoothly to target DOM element on step change
  useEffect(() => {
    if (!isActive) return

    // 1. Change route if necessary
    if (location.pathname !== currentStep.route) {
      navigate(currentStep.route)
    }

    // 2. Poll for DOM element mounting across lazy loaded routes
    let attempts = 0
    const maxAttempts = 25
    const interval = setInterval(() => {
      attempts++
      const target = document.getElementById(currentStep.sectionId)
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' })
        clearInterval(interval)
      } else if (attempts >= maxAttempts) {
        clearInterval(interval)
      }
    }, 80)

    return () => clearInterval(interval)
  }, [isActive, currentStepIndex, currentStep, location.pathname, navigate])

  if (!isActive) return null

  return (
    <AnimatePresence>
      <motion.aside
        role="dialog"
        aria-label="60-Second Judge Tour"
        initial={{ opacity: 0, y: 20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 15, scale: 0.97 }}
        transition={{ duration: 0.15 }}
        className="volt-judge-overlay"
      >
        <div className="volt-judge-progress-bar-wrap">
          <Progress value={totalProgressPercent} />
        </div>

        <div className="volt-judge-header">
          <div className="volt-judge-step-indicator">
            <span className="volt-judge-badge">
              {currentStep.badge}
            </span>
            <span className="volt-judge-timer mono">
              {Math.floor(totalRemainingSec / 60)}:{(totalRemainingSec % 60).toString().padStart(2, '0')}
            </span>
          </div>

          <div className="volt-judge-actions-top">
            <button
              type="button"
              onClick={isPaused ? resumeTour : pauseTour}
              className="volt-judge-icon-btn"
              title={isPaused ? 'Resume tour' : 'Pause tour'}
              aria-label={isPaused ? 'Resume tour' : 'Pause tour'}
            >
              {isPaused ? <Play size={11} /> : <Pause size={11} />}
            </button>
            <button
              type="button"
              onClick={startTour}
              className="volt-judge-icon-btn"
              title="Restart tour from beginning"
              aria-label="Restart tour"
            >
              <RotateCcw size={11} />
            </button>
            <button
              type="button"
              onClick={stopTour}
              className="volt-judge-icon-btn"
              title="Exit tour"
              aria-label="Exit tour"
            >
              <X size={11} />
            </button>
          </div>
        </div>

        <div className="volt-judge-content">
          <h4 className="volt-judge-title">
            <span>{currentStep.number}.</span>
            <span>{currentStep.title}</span>
          </h4>
          <p className="volt-judge-subtitle">{currentStep.subtitle}</p>

          {currentStep.actionType === 'tamper' && (
            <div className="volt-judge-interactive-row">
              <Button
                variant="destructive"
                size="sm"
                onClick={handleTamperDemo}
                className="gap-1 text-xs py-0 h-6 font-mono"
              >
                <ShieldAlert size={12} />
                {currentStep.actionLabel}
              </Button>
            </div>
          )}
        </div>

        <div className="volt-judge-footer">
          <div className="volt-judge-dots">
            {TOUR_STEPS.map((step, idx) => (
              <button
                key={step.id}
                type="button"
                onClick={() => goToStep(idx)}
                className={`volt-judge-dot ${idx === currentStepIndex ? 'volt-judge-dot-active' : ''}`}
                aria-label={`Jump to step ${idx + 1}`}
              />
            ))}
          </div>

          <div className="volt-judge-nav-btns">
            <Button
              variant="outline"
              size="sm"
              onClick={prevStep}
              disabled={currentStepIndex === 0}
              aria-label="Previous step"
              className="h-7 text-xs px-2"
            >
              <ChevronLeft size={12} />
              Prev
            </Button>
            <Button
              variant="volt"
              size="sm"
              onClick={nextStep}
              aria-label={currentStepIndex === TOUR_STEPS.length - 1 ? 'Finish Tour' : 'Next step'}
              className="h-7 text-xs px-2.5"
            >
              {currentStepIndex === TOUR_STEPS.length - 1 ? (
                'Finish'
              ) : (
                <>
                  Next ({stepRemainingSec}s)
                  <ChevronRight size={12} />
                </>
              )}
            </Button>
          </div>
        </div>
      </motion.aside>
    </AnimatePresence>
  )
}

export function JudgeTourLaunchButton() {
  const startTour = useTourStore((s) => s.startTour)
  const isActive = useTourStore((s) => s.isActive)

  if (isActive) return null

  return (
    <Button
      variant="volt"
      size="sm"
      onClick={startTour}
      className="gap-1 shadow-sm font-mono text-xs h-7 px-2.5"
      title="Start 60-second interactive judge tour"
    >
      <span className="text-sun">⚡</span>
      <span>60s Tour</span>
    </Button>
  )
}
