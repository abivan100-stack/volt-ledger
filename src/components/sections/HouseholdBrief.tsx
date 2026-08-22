import { buildHouseholdBrief } from '../../lib/householdBrief'
import type { Household } from '../../store/useEnergyStore'
import './HouseholdBrief.css'

interface HouseholdBriefProps {
  household: Household
  onClose: () => void
}

const STATUS_LABEL = {
  EXPORTING: 'Producing',
  IMPORTING: 'Drawing locally',
  BALANCED: 'Balanced',
} as const

/** Compact companion to the homepage map; the detailed dossier remains on the neighbourhood route. */
function HouseholdBrief({ household, onClose }: HouseholdBriefProps) {
  const brief = buildHouseholdBrief(household)
  const statusClass = `household-brief-status-${brief.status.toLowerCase()}`

  return (
    <aside id="network-household-brief" className="household-brief" aria-labelledby="household-brief-title">
      <div className="household-brief-heading">
        <div>
          <div className={`mono household-brief-status ${statusClass}`}>
            <span className="household-brief-status-dot" />
            {STATUS_LABEL[brief.status]}
          </div>
          <h2 id="household-brief-title" className="serif household-brief-name">{brief.name}</h2>
          <p className="mono household-brief-system">{brief.system}</p>
        </div>
        <button type="button" onClick={onClose} className="mono household-brief-close" aria-label={`Close ${brief.name} snapshot`}>
          ×
        </button>
      </div>

      <div className="household-brief-metrics">
        <BriefMetric label="Net flow" value={brief.net} accent={brief.netPositive ? 'sun' : 'settle'} />
        <BriefMetric label="Output now" value={brief.out} />
        <BriefMetric label="Demand now" value={brief.draw} />
        <BriefMetric label="Local activity" value={brief.trades} caption={`${brief.netBenefit} net benefit today`} />
      </div>
    </aside>
  )
}

interface BriefMetricProps {
  label: string
  value: string
  caption?: string
  accent?: 'sun' | 'settle'
}

function BriefMetric({ label, value, caption, accent }: BriefMetricProps) {
  return (
    <div className="household-brief-metric">
      <div className="mono household-brief-metric-label">{label}</div>
      <div className={`mono household-brief-metric-value${accent ? ` household-brief-metric-value-${accent}` : ''}`}>{value}</div>
      {caption && <div className="mono household-brief-metric-caption">{caption}</div>}
    </div>
  )
}

export default HouseholdBrief
