import { useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import {
  Play,
  Pause,
  ChevronRight,
  ChevronLeft,
  X,
  RotateCcw,
  Zap,
  ShieldAlert,
} from 'lucide-react'
import {
  useTourStore,
  TOUR_STEPS,
  TOTAL_TOUR_SECONDS,
} from '../../store/useTourStore'
import { useEnergyStore } from '../../store/useEnergyStore'
import { scrollToId } from '../../utils/scrollToId'
import { Button } from '../ui/button'
import { Progress } from '../ui/progress'
import { Badge } from '../ui/badge'
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

  const runTamperTest = useEnergyStore((s) => s.runTamperTest)

  const currentStep = TOUR_STEPS[currentStepIndex] || TOUR_STEPS[0]
  const elapsedTotal = TOTAL_TOUR_SECONDS - totalRemainingSec
  const totalProgressPercent = (elapsedTotal / TOTAL_TOUR_SECONDS) * 100

  // 1-second interval timer when active
  useEffect(() => {
    if (!isActive) return
    const timer = setInterval(() => {
      tickSecond()
    }, 1000)
    return () => clearInterval(timer)
  }, [isActive, tickSecond])

  // Navigate and scroll to target section when step changes
  useEffect(() => {
    if (!isActive) return
    if (location.pathname !== currentStep.route) {
      navigate(currentStep.route)
    }
    const timeout = setTimeout(() => {
      scrollToId(currentStep.sectionId)
    }, 150)
    return () => clearTimeout(timeout)
  }, [isActive, currentStepIndex, currentStep, location.pathname, navigate])

  if (!isActive) return null

  return (
    <AnimatePresence>
      <motion.div
        role="dialog"
        aria-label="60-Second Judge Tour"
        initial={{ opacity: 0, y: 30, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.95 }}
        transition={{ duration: 0.2 }}
        className="volt-judge-overlay"
      >
        <div className="volt-judge-header">
          <div className="volt-judge-step-indicator">
            <Badge variant="volt">
              {currentStep.badge}
            </Badge>
            <span className="volt-judge-timer mono">
              {Math.floor(totalRemainingSec / 60)}:{(totalRemainingSec % 60).toString().padStart(2, '0')} left
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
              {isPaused ? <Play size={13} /> : <Pause size={13} />}
            </button>
            <button
              type="button"
              onClick={startTour}
              className="volt-judge-icon-btn"
              title="Restart tour from beginning"
              aria-label="Restart tour"
            >
              <RotateCcw size={13} />
            </button>
            <button
              type="button"
              onClick={stopTour}
              className="volt-judge-icon-btn"
              title="Exit tour"
              aria-label="Exit tour"
            >
              <X size={13} />
            </button>
          </div>
        </div>

        <div className="volt-judge-progress-bar-wrap">
          <Progress value={totalProgressPercent} className="h-1.5" />
        </div>

        <div className="volt-judge-content">
          <h4 className="volt-judge-title">
            {currentStep.number}. {currentStep.title}
          </h4>
          <p className="volt-judge-subtitle">{currentStep.subtitle}</p>

          <ul className="volt-judge-points">
            {currentStep.keyPoints.map((pt, idx) => (
              <li key={idx} className="volt-judge-point-item">
                <span className="volt-judge-point-bullet">›</span>
                <span>{pt}</span>
              </li>
            ))}
          </ul>

          {currentStep.actionType === 'tamper' && (
            <div className="mt-3">
              <Button
                variant="destructive"
                size="sm"
                onClick={runTamperTest}
                className="gap-1.5 text-xs"
              >
                <ShieldAlert size={14} />
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
            >
              <ChevronLeft size={14} />
              Prev
            </Button>
            <Button
              variant="volt"
              size="sm"
              onClick={nextStep}
              aria-label={currentStepIndex === TOUR_STEPS.length - 1 ? 'Finish Tour' : 'Next step'}
            >
              {currentStepIndex === TOUR_STEPS.length - 1 ? (
                'Finish'
              ) : (
                <>
                  Next ({stepRemainingSec}s)
                  <ChevronRight size={14} />
                </>
              )}
            </Button>
          </div>
        </div>
      </motion.div>
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
      className="gap-1 shadow-sm font-mono text-xs"
      title="Start 60-second interactive judge tour"
    >
      <Zap size={13} />
      <span>60s Tour</span>
    </Button>
  )
}
