import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useEnergyStore } from '../../store/useEnergyStore'
import { HOUSEHOLD_COUNT } from '../../store/simSlice'
import type { HouseholdStatus } from '../../lib/householdStatus'
import {
  FLOW_WINDOW,
  networkFeeders,
  networkFlows,
  networkNodes,
  networkSummary,
  type NetworkStatus,
  type StageSize,
} from '../../lib/energyNetwork'
import type { CSSVars } from '../ui/cssVars'
import './EnergyNetwork.css'

const STATUS_COPY: Record<NetworkStatus, string> = {
  surplus: 'Surplus available',
  balanced: 'Network balanced',
  deficit: 'Demand exceeds supply',
}

const ROLE_CLASS: Record<HouseholdStatus, string> = {
  EXPORTING: 'net-node-produce',
  IMPORTING: 'net-node-consume',
  BALANCED: 'net-node-idle',
}

/** Read aloud between the name and the value, so the sign is never colour-only. */
const ROLE_WORD: Record<HouseholdStatus, string> = {
  EXPORTING: 'producing',
  IMPORTING: 'drawing',
  BALANCED: 'balanced at',
}

const ROLE_ARROW: Record<HouseholdStatus, string> = {
  EXPORTING: '▲',
  IMPORTING: '▼',
  BALANCED: '—',
}

/** Glyph inside the node chip: up chevron, down chevron, or a level bar. */
const ROLE_MARK: Record<HouseholdStatus, string> = {
  EXPORTING: 'M9.2 17.1 12 14.1 14.8 17.1',
  IMPORTING: 'M9.2 14.1 12 17.1 14.8 14.1',
  BALANCED: 'M9.2 15.6H14.8',
}

function netLabel(status: HouseholdStatus, net: number): string {
  if (status === 'EXPORTING') return `+${net.toFixed(1)} kW`
  if (status === 'IMPORTING') return `−${Math.abs(net).toFixed(1)} kW`
  return `${Math.abs(net).toFixed(1)} kW`
}

function signedKw(value: number): string {
  return `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(1)}`
}

/**
 * The landing page's hero visualization: the whole street as one graph, drawn
 * from live store data — ten real households on a fixed ring, the physical
 * feeder loop between them, and one animated flow per pair that has actually
 * settled energy in the recent chain window.
 *
 * The SVG carries only the wires and is measured in CSS pixels (so stroke
 * weights and dashes never distort); the node chips are real DOM text placed
 * by percentage, which keeps every label crisp, themeable and readable by a
 * screen reader.
 */
function EnergyNetwork() {
  const households = useEnergyStore((state) => state.households)
  const chain = useEnergyStore((state) => state.chain)
  const activity = useEnergyStore((state) => state.config.activity)
  const stageRef = useRef<HTMLDivElement>(null)
  // useId() yields ':r0:'-style values; colons are legal in an id but awkward
  // inside an SVG url(#...) reference, so strip them.
  const gradientPrefix = useId().replace(/:/g, '')
  const [stage, setStage] = useState<StageSize>({ width: 0, height: 0 })
  const [hovered, setHovered] = useState<number | null>(null)

  useEffect(() => {
    const element = stageRef.current
    if (!element || typeof ResizeObserver === 'undefined') return
    const measure = () => {
      const rect = element.getBoundingClientRect()
      const width = Math.round(rect.width)
      const height = Math.round(rect.height)
      setStage((previous) =>
        previous.width === width && previous.height === height ? previous : { width, height },
      )
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const nodes = useMemo(() => networkNodes(households), [households])
  const feeders = useMemo(() => networkFeeders(nodes, stage), [nodes, stage])
  const flows = useMemo(
    () => networkFlows(nodes, chain.slice(-FLOW_WINDOW).map((block) => block.payload), stage),
    [nodes, chain, stage],
  )
  const summary = useMemo(() => networkSummary(households, flows), [households, flows])

  return (
    <section
      data-reveal
      aria-labelledby="net-title"
      className="net-panel"
      style={{ '--net-activity': activity } as CSSVars}
    >
      <header className="net-head">
        <div className="net-head-top">
          <span className="eyebrow">Live · Nolambur microgrid</span>
          <p className={`mono net-status net-status-${summary.status}`}>
            <span aria-hidden="true" className="net-status-dot" />
            {STATUS_COPY[summary.status]}
          </p>
        </div>
        <h2 id="net-title" className="serif net-title">
          Community Energy Network
        </h2>
        <p className="net-sub">
          Who is generating, who is drawing, and where this street&rsquo;s surplus solar is going —
          right now.
        </p>
      </header>

      <div ref={stageRef} className="net-stage" data-hovering={hovered === null ? undefined : ''}>
        <svg
          aria-hidden="true"
          focusable="false"
          className="net-wires"
          viewBox={`0 0 ${Math.max(1, stage.width)} ${Math.max(1, stage.height)}`}
        >
          <defs>
            {flows.map((flow) => (
              <linearGradient
                key={flow.key}
                id={`${gradientPrefix}-${flow.key}`}
                gradientUnits="userSpaceOnUse"
                x1={flow.x1}
                y1={flow.y1}
                x2={flow.x2}
                y2={flow.y2}
              >
                <stop offset="0%" className="net-stop-from" />
                <stop offset="100%" className="net-stop-to" />
              </linearGradient>
            ))}
          </defs>
          <g className="net-feeders">
            {feeders.map((feeder) => (
              <path key={feeder.key} d={feeder.d} />
            ))}
          </g>
          {flows.map((flow) => (
            <g
              key={flow.key}
              className="net-flow"
              data-active={hovered === null || hovered === flow.from || hovered === flow.to ? '' : undefined}
              style={{ '--net-flow-weight': flow.weight } as CSSVars}
            >
              <path className="net-flow-line" d={flow.d} stroke={`url(#${gradientPrefix}-${flow.key})`} />
              <path
                className={`net-flow-pulse net-flow-pulse-${flow.tier}`}
                d={flow.d}
                stroke={`url(#${gradientPrefix}-${flow.key})`}
              />
            </g>
          ))}
        </svg>

        <ul className="net-nodes">
          {nodes.map((node, index) => (
            <li
              key={node.id}
              className={`net-node ${ROLE_CLASS[node.status]} ${node.labelAbove ? 'net-node-above' : 'net-node-below'}`}
              data-dim={hovered === null || hovered === index ? undefined : ''}
              style={{ '--net-node-x': `${node.x}%`, '--net-node-y': `${node.y}%` } as CSSVars}
              onPointerEnter={() => setHovered(index)}
              onPointerLeave={() => setHovered(null)}
            >
              <span className="net-node-chip">
                <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" className="net-node-glyph">
                  <path className="net-glyph-roof" d="M12 4.4 20.6 11.3H3.4Z" />
                  <path className="net-glyph-body" d="M5.9 11.3V19.6H18.1V11.3" />
                  <path className="net-glyph-mark" d={ROLE_MARK[node.status]} />
                </svg>
              </span>
              <span className="net-node-text">
                <span className="net-node-name">{node.label}</span>
                <span className="sr-only">{` ${node.name}, ${ROLE_WORD[node.status]} `}</span>
                <span className="mono net-node-value">
                  <span aria-hidden="true" className="net-node-arrow">
                    {ROLE_ARROW[node.status]}
                  </span>
                  {netLabel(node.status, node.net)}
                </span>
              </span>
            </li>
          ))}
        </ul>

        {flows.length === 0 && (
          <p className="mono net-stage-note">NO SETTLEMENTS IN THE LAST WINDOW · FEEDER IDLE</p>
        )}
      </div>

      <ul className="net-legend">
        <li className="mono net-legend-item net-legend-produce">
          <span aria-hidden="true" className="net-legend-swatch" />
          Producer
        </li>
        <li className="mono net-legend-item net-legend-consume">
          <span aria-hidden="true" className="net-legend-swatch" />
          Consumer
        </li>
        <li className="mono net-legend-item net-legend-idle">
          <span aria-hidden="true" className="net-legend-swatch" />
          Balanced
        </li>
        <li className="mono net-legend-item net-legend-flow">
          <span aria-hidden="true" className="net-legend-wire" />
          Energy flow
        </li>
      </ul>

      <dl className="net-metrics">
        <div className="net-metric">
          <dt className="eyebrow net-metric-label">Generating</dt>
          <dd className="mono net-metric-value net-metric-value-produce">
            {summary.generated.toFixed(1)}
            <span className="net-metric-unit"> kW</span>
          </dd>
          <dd className="mono net-metric-note">{summary.producers} EXPORTING NOW</dd>
        </div>
        <div className="net-metric">
          <dt className="eyebrow net-metric-label">Consuming</dt>
          <dd className="mono net-metric-value net-metric-value-consume">
            {summary.consumed.toFixed(1)}
            <span className="net-metric-unit"> kW</span>
          </dd>
          <dd className="mono net-metric-note">{summary.consumers} DRAWING NOW</dd>
        </div>
        <div className="net-metric">
          <dt className="eyebrow net-metric-label">Balance</dt>
          <dd className={`mono net-metric-value net-metric-value-${summary.status}`}>
            {signedKw(summary.balance)}
            <span className="net-metric-unit"> kW</span>
          </dd>
          <dd className="mono net-metric-note">{HOUSEHOLD_COUNT} ROOFTOPS</dd>
        </div>
        <div className="net-metric">
          <dt className="eyebrow net-metric-label">Active flows</dt>
          <dd className="mono net-metric-value">{summary.activeFlows}</dd>
          <dd className="mono net-metric-note">LAST {FLOW_WINDOW} TRADES</dd>
        </div>
      </dl>
    </section>
  )
}

export default EnergyNetwork
