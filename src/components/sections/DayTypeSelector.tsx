import { useEffect, useRef, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { useEnergyStore } from '../../store/useEnergyStore'
import { DAY_TYPES, DAY_TYPE_LABELS, type DayType } from '../../lib/simulation'
import { formatClock } from '../../lib/format'
import { copyText } from '../../utils/copyText'
import './DayTypeSelector.css'

const START_HOUR_PRESETS = [
  { hour: 6, label: 'SUNRISE' },
  { hour: 12, label: 'MIDDAY' },
  { hour: 17, label: 'EVENING' },
] as const

type CopyState = 'idle' | 'copied' | 'failed'

function DayTypeSelector() {
  const dayType = useEnergyStore((state) => state.dayType)
  const startHour = useEnergyStore((state) => state.config.startHour)
  const setDayType = useEnergyStore((state) => state.setDayType)
  const setStartHour = useEnergyStore((state) => state.setStartHour)
  const location = useLocation()
  const [, setSearchParams] = useSearchParams()
  const [copyState, setCopyState] = useState<CopyState>('idle')
  const copyResetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(copyResetTimer.current), [])

  const updateScenarioSearch = (nextDayType: DayType, nextStartHour: number) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set('day', nextDayType)
        next.set('hour', String(nextStartHour))
        return next
      },
      { replace: true },
    )
  }

  const selectDayType = (option: DayType) => {
    setDayType(option)
    updateScenarioSearch(option, startHour)
  }

  const selectStartHour = (hour: number) => {
    setStartHour(hour)
    updateScenarioSearch(dayType, hour)
  }

  const copyScenarioLink = async () => {
    const params = new URLSearchParams(location.search)
    params.set('day', dayType)
    params.set('hour', String(startHour))
    const query = params.toString()
    const scenarioUrl = `${window.location.origin}${location.pathname}${query ? `?${query}` : ''}`
    const copied = await copyText(scenarioUrl)
    setCopyState(copied ? 'copied' : 'failed')
    clearTimeout(copyResetTimer.current)
    copyResetTimer.current = setTimeout(() => setCopyState('idle'), 2200)
  }

  const copyLabel = copyState === 'copied'
    ? 'SCENARIO LINK COPIED'
    : copyState === 'failed'
      ? 'COPY FAILED — TRY AGAIN'
      : 'COPY SCENARIO LINK'
  const startHourPresets = START_HOUR_PRESETS.some((preset) => preset.hour === startHour)
    ? START_HOUR_PRESETS
    : [{ hour: startHour, label: 'CURRENT' as const }, ...START_HOUR_PRESETS]

  return (
    <div data-reveal className="day-type-selector">
      <div className="day-type-control">
        <span className="eyebrow day-type-label">Day Type</span>
        <div className="day-type-options" role="group" aria-label="Simulated day type">
          {DAY_TYPES.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => selectDayType(option)}
              aria-pressed={option === dayType}
              className={`mono day-type-option ${option === dayType ? 'day-type-option-active' : ''}`}
            >
              {DAY_TYPE_LABELS[option]}
            </button>
          ))}
        </div>
      </div>

      <div className="day-type-control">
        <span className="eyebrow day-type-label">Start Time</span>
        <div className="day-type-options" role="group" aria-label="Simulation start time">
          {startHourPresets.map((preset) => {
            const time = formatClock(preset.hour * 60)
            return (
              <button
                key={preset.hour}
                type="button"
                onClick={() => selectStartHour(preset.hour)}
                aria-pressed={preset.hour === startHour}
                className={`mono day-type-option ${preset.hour === startHour ? 'day-type-option-active' : ''}`}
              >
                {preset.label} {time}
              </button>
            )
          })}
        </div>
      </div>

      <div className="day-type-share">
        <button
          type="button"
          onClick={() => void copyScenarioLink()}
          className="mono day-type-share-button"
        >
          {copyLabel}
        </button>
        {copyState !== 'idle' && (
          <span className="mono day-type-share-status" role="status" aria-live="polite">
            {copyState === 'copied' ? 'Replay opens this day and time.' : 'Your browser blocked copying.'}
          </span>
        )}
      </div>
    </div>
  )
}

export default DayTypeSelector
