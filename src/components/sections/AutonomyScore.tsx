import { useEnergyStore } from '../../store/useEnergyStore'
import { autonomyPct } from '../../lib/gridDependence'
import { DAY_TYPE_LABELS } from '../../lib/simulation'
import { useAnimatedNumber } from '../../hooks/useAnimatedNumber'
import './AutonomyScore.css'

const TWEEN_DURATION_SECONDS = 0.7

function AutonomyScore() {
  const dayType = useEnergyStore((state) => state.dayType)
  const breakdown = useEnergyStore((state) => state.dailyBreakdown)
  const targetPct = autonomyPct(breakdown)
  const displayPct = useAnimatedNumber(targetPct, TWEEN_DURATION_SECONDS)

  return (
    <div data-reveal className="autonomy-score">
      <div className="eyebrow autonomy-score-label">Neighbourhood Autonomy</div>
      <div className="mono autonomy-score-value">
        {displayPct.toFixed(0)}
        <span className="autonomy-score-unit">%</span>
      </div>
      <p className="autonomy-score-subtitle">
        Of today's power stayed on the street — solar, battery, and trades between neighbours — instead of coming
        from the grid.
      </p>
      <div className="mono autonomy-score-caption">
        MODELED FOR {DAY_TYPE_LABELS[dayType].toUpperCase()} · NOT LIVE TRADE STATE
      </div>
    </div>
  )
}

export default AutonomyScore
