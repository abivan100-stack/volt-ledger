import { memo, useMemo } from 'react'
import { useEnergyStore } from '../../store/useEnergyStore'
import { fairnessSummary } from '../../lib/fairness'
import { formatMoney } from '../../lib/format'
import type { CSSVars } from '../ui/cssVars'
import type { HouseholdBenefit } from '../../lib/fairness'
import './FairnessScore.css'

interface FairnessScoreRowProps {
  household: HouseholdBenefit
  maxAbs: number
  isBest: boolean
  isWorst: boolean
}

const FairnessScoreRow = memo(function FairnessScoreRow({
  household,
  maxAbs,
  isBest,
  isWorst,
}: FairnessScoreRowProps) {
  const pct = (Math.abs(household.netBenefit) / maxAbs) * 50
  const rowClass = isBest
    ? 'fairness-score-row-best'
    : isWorst
      ? 'fairness-score-row-worst'
      : ''
  return (
    <div className={`fairness-score-row ${rowClass}`}>
      <span className="mono fairness-score-row-name">
        {household.name}
        {isBest ? ' · BEST-OFF' : ''}
        {isWorst ? ' · WORST-OFF' : ''}
      </span>
      <div className="fairness-score-row-track">
        <div className="fairness-score-row-zero" />
        <div
          className={
            household.netBenefit >= 0
              ? 'fairness-score-row-bar fairness-score-row-bar-positive'
              : 'fairness-score-row-bar fairness-score-row-bar-negative'
          }
          style={{ '--bar-pct': pct } as CSSVars}
        />
      </div>
      <span className="mono fairness-score-row-value">{formatMoney(household.netBenefit)}</span>
    </div>
  )
})

function FairnessScore() {
  const households = useEnergyStore((state) => state.households)
  const summary = useMemo(() => fairnessSummary(households), [households])

  const maxAbs = Math.max(1, ...summary.households.map((h) => Math.abs(h.netBenefit)))
  const sorted = [...summary.households].sort((a, b) => b.netBenefit - a.netBenefit)

  return (
    <div data-reveal className="fairness-score">
      <div className="eyebrow fairness-score-label">Fairness — Net Benefit Today</div>
      <p className="fairness-score-definition">
        What each household earned selling surplus, minus what it spent buying — today's trading only, not
        account balance.
      </p>

      <div className="fairness-score-summary">
        <div className="fairness-score-stat">
          <div className="mono fairness-score-stat-label">SPREAD</div>
          <div className="mono fairness-score-stat-value">{formatMoney(summary.spread)}</div>
          <div className="mono fairness-score-stat-caption">BEST MINUS WORST</div>
        </div>
        <div className="fairness-score-stat">
          <div className="mono fairness-score-stat-label">RATIO</div>
          <div className="mono fairness-score-stat-value">
            {summary.ratio == null ? '—' : `${summary.ratio.toFixed(1)}×`}
          </div>
          <div className="mono fairness-score-stat-caption">
            {summary.ratio == null ? 'NOT MEANINGFUL — WORST-OFF EARNED NOTHING' : 'BEST ÷ WORST'}
          </div>
        </div>
      </div>

      <div className="fairness-score-rows">
        {sorted.map((household) => (
          <FairnessScoreRow
            key={household.name}
            household={household}
            maxAbs={maxAbs}
            isBest={household.name === summary.best.name}
            isWorst={household.name === summary.worst.name}
          />
        ))}
      </div>
    </div>
  )
}

export default FairnessScore
