import { useMemo } from 'react'
import { useEnergyStore } from '../../store/useEnergyStore'
import { hourlyGridDependence } from '../../lib/gridDependence'
import type { CSSVars } from '../ui/cssVars'
import './GridDependenceMeter.css'

const SEGMENTS = [
  { key: 'solarPct', label: 'Solar direct', className: 'grid-dependence-segment-solar' },
  { key: 'tradePct', label: 'Local trade', className: 'grid-dependence-segment-trade' },
  { key: 'batteryPct', label: 'Battery', className: 'grid-dependence-segment-battery' },
  { key: 'gridPct', label: 'Grid import', className: 'grid-dependence-segment-grid' },
] as const

function GridDependenceMeter() {
  const households = useEnergyStore((state) => state.households)
  const dayType = useEnergyStore((state) => state.dayType)
  const simMinute = useEnergyStore((state) => state.simMinute)
  const daily = useEnergyStore((state) => state.dailyBreakdown)
  const hourly = useMemo(
    () => hourlyGridDependence(households, simMinute / 60, dayType),
    [households, simMinute, dayType],
  )

  return (
    <div data-reveal className="grid-dependence-meter">
      <div className="eyebrow grid-dependence-label">Grid Dependence Today</div>
      <div className="mono grid-dependence-value">
        {daily.gridPct.toFixed(0)}
        <span className="grid-dependence-unit">% from the grid</span>
      </div>

      <div className="grid-dependence-bar" role="img" aria-label={`${daily.gridPct.toFixed(0)}% of demand met by grid import`}>
        {SEGMENTS.map((segment) => (
          <div
            key={segment.key}
            className={`grid-dependence-segment ${segment.className}`}
            style={{ '--segment-pct': daily[segment.key] } as CSSVars}
          />
        ))}
      </div>

      <div className="grid-dependence-legend">
        {SEGMENTS.map((segment) => (
          <span key={segment.key} className="mono grid-dependence-legend-item">
            <span className={`grid-dependence-legend-swatch ${segment.className}`} />
            {segment.label} {daily[segment.key].toFixed(0)}%
          </span>
        ))}
      </div>

      <div className="mono grid-dependence-caption">
        RIGHT NOW · {hourly.gridPct.toFixed(0)}% GRID · FULL-DAY MODEL, NOT LIVE TRADE STATE
      </div>
    </div>
  )
}

export default GridDependenceMeter
