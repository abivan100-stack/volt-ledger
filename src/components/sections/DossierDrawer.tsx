import { useEffect, useMemo, useRef } from 'react'
import { useEnergyStore } from '../../store/useEnergyStore'
import { buildDossier } from '../../lib/dossier'
import './DossierDrawer.css'

const FOCUSABLE = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'

function DossierDrawer() {
  const selectedHouseIndex = useEnergyStore((state) => state.selectedHouseIndex)
  const households = useEnergyStore((state) => state.households)
  const chain = useEnergyStore((state) => state.chain)
  const simMinute = useEnergyStore((state) => state.simMinute)
  const dayType = useEnergyStore((state) => state.dayType)
  const closeDossier = useEnergyStore((state) => state.closeDossier)
  const sheetRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<Element | null>(null)

  useEffect(() => {
    if (selectedHouseIndex == null) return
    triggerRef.current = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const sheet = sheetRef.current
    if (sheet) {
      const first = sheet.querySelector<HTMLElement>(FOCUSABLE)
      first?.focus()
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        closeDossier()
        return
      }
      if (event.key !== 'Tab' || !sheet) return
      const focusable = [...sheet.querySelectorAll<HTMLElement>(FOCUSABLE)]
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      if (triggerRef.current instanceof HTMLElement) triggerRef.current.focus()
    }
  }, [selectedHouseIndex, closeDossier])

  const household = selectedHouseIndex == null ? undefined : households[selectedHouseIndex]
  const dossier = useMemo(
    () => (household ? buildDossier(household, chain, simMinute, dayType) : null),
    [household, chain, simMinute, dayType],
  )

  if (!dossier) return null
  const accentClass = `dossier-accent-${dossier.status.toLowerCase()}`

  return (
    <div className="dossier-overlay">
      <button type="button" onClick={closeDossier} aria-label="Close dossier" className="dossier-scrim" />
      <div ref={sheetRef} role="dialog" aria-modal="true" aria-labelledby="dossier-title" className="dossier-sheet">
        <div className="dossier-sheet-header">
          <div className="dossier-header-info">
            <div className={`dossier-status-row ${accentClass}`}>
              <span className="dossier-status-dot" />
              <span className="mono dossier-status-label">{dossier.status}</span>
            </div>
            <div id="dossier-title" className="serif dossier-name">{dossier.name}</div>
            <div className="mono dossier-sub">{dossier.sub}</div>
          </div>
          <button type="button" onClick={closeDossier} aria-label="Close dossier" className="mono dossier-close-button">
            ×
          </button>
        </div>

        <div className="dossier-body">
          <div className="eyebrow dossier-section-label dossier-section-label-tight">Live now</div>
          <div className="dossier-live-grid">
            <div className="dossier-live-cell">
              <div className="mono dossier-live-label">OUTPUT</div>
              <div className="mono dossier-live-value">
                {dossier.out}
                <span className="dossier-live-unit"> kW</span>
              </div>
            </div>
            <div className="dossier-live-cell">
              <div className="mono dossier-live-label">DRAW</div>
              <div className="mono dossier-live-value">
                {dossier.draw}
                <span className="dossier-live-unit"> kW</span>
              </div>
            </div>
            <div className="dossier-live-cell">
              <div className="mono dossier-live-label">NET FLOW</div>
              <div className={`mono dossier-live-value ${dossier.netPositive ? 'dossier-net-sun' : 'dossier-net-settle'}`}>
                {dossier.net}
                <span className="dossier-live-unit"> kW</span>
              </div>
            </div>
            <div className="dossier-live-cell">
              <div className="mono dossier-live-label">WALLET</div>
              <div className="mono dossier-live-value">{dossier.balance}</div>
            </div>
          </div>

          <div className="dossier-chart-header">
            <div className="eyebrow">Today · generation vs demand</div>
            <div className="mono dossier-chart-now">NOW {dossier.now}</div>
          </div>
          <div className="dossier-chart-frame">
            <svg viewBox="0 0 320 132" width="100%" className="dossier-chart-svg">
              <line x1="6" y1="112" x2="314" y2="112" stroke="var(--rule-2)" strokeWidth="1" />
              <path d={dossier.areaPath} fill="rgba(178,106,18,0.13)" stroke="none" />
              <polyline points={dossier.conLine} fill="none" stroke="var(--settle)" strokeWidth="1.25" />
              <polyline points={dossier.genLine} fill="none" stroke="var(--sun)" strokeWidth="1.6" />
              <line
                x1={dossier.nowX}
                y1="12"
                x2={dossier.nowX}
                y2="112"
                stroke="var(--ink-soft)"
                strokeWidth="1"
                strokeDasharray="2 3"
              />
              <text x={dossier.ax6} y="126" textAnchor="middle" className="dossier-chart-axis-label">
                06:00
              </text>
              <text x={dossier.ax12} y="126" textAnchor="middle" className="dossier-chart-axis-label">
                12:00
              </text>
              <text x={dossier.ax18} y="126" textAnchor="middle" className="dossier-chart-axis-label">
                18:00
              </text>
            </svg>
            <div className="dossier-chart-legend">
              <span className="mono dossier-chart-legend-item">
                <span className="dossier-chart-legend-swatch dossier-chart-legend-swatch-sun" />
                GENERATION
              </span>
              <span className="mono dossier-chart-legend-item">
                <span className="dossier-chart-legend-swatch dossier-chart-legend-swatch-settle" />
                DEMAND
              </span>
            </div>
          </div>

          <div className="dossier-day-stats">
            <div className="dossier-day-stat">
              <div className="mono dossier-day-stat-label">GEN</div>
              <div className="mono dossier-day-stat-value">{dossier.gen}</div>
              <div className="mono dossier-day-stat-unit">kWh</div>
            </div>
            <div className="dossier-day-stat">
              <div className="mono dossier-day-stat-label">USED</div>
              <div className="mono dossier-day-stat-value">{dossier.con}</div>
              <div className="mono dossier-day-stat-unit">kWh</div>
            </div>
            <div className="dossier-day-stat">
              <div className="mono dossier-day-stat-label">EXPORT</div>
              <div className="mono dossier-day-stat-value dossier-day-stat-value-sun">{dossier.exp}</div>
              <div className="mono dossier-day-stat-unit">kWh</div>
            </div>
            <div className="dossier-day-stat dossier-day-stat-last">
              <div className="mono dossier-day-stat-label">IMPORT</div>
              <div className="mono dossier-day-stat-value dossier-day-stat-value-settle">{dossier.imp}</div>
              <div className="mono dossier-day-stat-unit">kWh</div>
            </div>
          </div>
          <div className="mono dossier-self-note">{dossier.selfNote}</div>

          <div className="eyebrow dossier-section-label">Rooftop specification</div>
          <div className="dossier-specs">
            {dossier.specs.map((spec) => (
              <div key={spec.label} className="dossier-spec-row">
                <span className="mono dossier-spec-label">{spec.label}</span>
                <span className="mono dossier-spec-value">{spec.value}</span>
              </div>
            ))}
          </div>

          <div className="eyebrow dossier-section-label">Ledger activity · today</div>
          <div className="dossier-activity-stats">
            <div className="dossier-activity-stat">
              <div className="mono dossier-activity-stat-label">EARNED</div>
              <div className="mono dossier-activity-stat-value dossier-net-sun">+₹{dossier.earned}</div>
            </div>
            <div className="dossier-activity-stat">
              <div className="mono dossier-activity-stat-label">SPENT</div>
              <div className="mono dossier-activity-stat-value dossier-net-settle">−₹{dossier.spent}</div>
            </div>
            <div className="dossier-activity-stat dossier-activity-stat-last">
              <div className="mono dossier-activity-stat-label">TRADES</div>
              <div className="mono dossier-activity-stat-value">{dossier.trades}</div>
            </div>
          </div>
          {dossier.activities.map((activity) => {
            const colorClass = activity.invalid
              ? 'dossier-activity-void'
              : activity.direction === 'SOLD'
                ? 'dossier-net-sun'
                : 'dossier-net-settle'
            return (
              <div key={activity.id} className="mono dossier-activity-row">
                <span className="dossier-activity-time">{activity.time}</span>
                <span className="dossier-activity-desc">
                  <span className={colorClass}>{activity.direction}</span> <span className="dossier-activity-arrow">{activity.arrow}</span>{' '}
                  <span className="dossier-activity-other">{activity.counterparty}</span>
                </span>
                <span className="dossier-activity-amounts">
                  <span className="dossier-activity-kwh">{activity.kwh} kWh</span>{'  '}
                  <span className={colorClass}>{activity.credit}</span>
                </span>
              </div>
            )
          })}
          {dossier.activities.length === 0 && <div className="mono dossier-no-activity">No trades yet today.</div>}
        </div>
      </div>
    </div>
  )
}

export default DossierDrawer
