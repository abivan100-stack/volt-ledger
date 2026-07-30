import { memo } from 'react'
import { useEnergyStore, type Household } from '../../store/useEnergyStore'
import { formatMoney } from '../../lib/format'
import { statusForNet, type HouseholdStatus } from '../../lib/householdStatus'
import './HouseholdGrid.css'

function accentClassFor(status: HouseholdStatus): string {
  if (status === 'EXPORTING') return 'household-card-accent-exporting'
  if (status === 'IMPORTING') return 'household-card-accent-importing'
  return 'household-card-accent-balanced'
}

interface HouseholdCardProps {
  household: Household
  index: number
  onSelect: (index: number) => void
}

const HouseholdCard = memo(function HouseholdCard({
  household,
  index,
  onSelect,
}: HouseholdCardProps) {
  const status = statusForNet(household.net)
  return (
    <button
      key={household.name}
      type="button"
      onClick={() => onSelect(index)}
      title="Open dossier"
      className={`household-card ${accentClassFor(status)}`}
    >
      <div className="household-card-top">
        <span className="mono household-card-meta">
          {household.pv > 0 ? `${household.pv.toFixed(1)} kW ROOFTOP` : 'NO ROOFTOP PV'}
        </span>
        <span className="mono household-card-status">{status}</span>
      </div>
      <div className="serif household-card-name">{household.name}</div>
      <div className="mono household-card-balance">{formatMoney(household.balance)}</div>
      <div className="household-card-flow">
        <div className="mono household-card-flow-row">
          <span className="household-card-flow-label">OUTPUT</span>
          <span className="household-card-flow-value">{household.out.toFixed(2)} kW</span>
        </div>
        <div className="mono household-card-flow-row">
          <span className="household-card-flow-label">DRAW</span>
          <span className="household-card-flow-value">{household.draw.toFixed(2)} kW</span>
        </div>
      </div>
      <div className="household-card-footer">
        <span className="mono household-card-footer-label">OPEN DOSSIER</span>
        <span className="mono household-card-footer-arrow">↗</span>
      </div>
    </button>
  )
}, function cardPropsAreEqual(prev, next) {
  const ph = prev.household
  const nh = next.household
  return (
    ph.out === nh.out &&
    ph.draw === nh.draw &&
    ph.balance === nh.balance &&
    ph.net === nh.net &&
    ph.name === nh.name &&
    ph.pv === nh.pv &&
    prev.index === next.index &&
    prev.onSelect === next.onSelect
  )
})

function HouseholdGrid() {
  const households = useEnergyStore((state) => state.households)
  const selectHouse = useEnergyStore((state) => state.selectHouse)

  return (
    <div>
      <div className="household-grid-header">
        <h2 className="serif household-grid-title">
          The street <span className="household-grid-title-sub">· ten households</span>
        </h2>
        <div className="household-grid-legend">
          <span className="mono household-grid-legend-item">
            <span className="household-grid-legend-swatch household-grid-legend-swatch-sun" />
            EXPORTING
          </span>
          <span className="mono household-grid-legend-item">
            <span className="household-grid-legend-swatch household-grid-legend-swatch-settle" />
            IMPORTING
          </span>
        </div>
      </div>
      <div data-reveal className="household-grid">
        {households.map((household, index) => (
          <HouseholdCard
            key={household.name}
            household={household}
            index={index}
            onSelect={selectHouse}
          />
        ))}
      </div>
    </div>
  )
}

export default HouseholdGrid
