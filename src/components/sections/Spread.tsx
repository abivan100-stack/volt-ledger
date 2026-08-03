import { useRef } from 'react'
import type { CSSVars } from '../ui/cssVars'
import SectionHeading from '../ui/SectionHeading'
import { useScrollReveal } from '../../hooks/useScrollReveal'
import { useSpreadTween } from '../../hooks/useSpreadTween'
import './Spread.css'

function Spread() {
  const containerRef = useRef<HTMLDivElement>(null)
  useScrollReveal(containerRef, 0.12)
  const { mode: spreadMode, tween, setMode } = useSpreadTween(containerRef)

  const sellPct = Math.max(0, (tween.sell / 8) * 100)
  const buyPct = Math.max(0, (tween.buy / 8) * 100)
  const gapPct = Math.max(0, buyPct - sellPct)
  const gapMidPct = sellPct + gapPct / 2
  const gap = Math.max(0, tween.buy - tween.sell)
  const isToday = spreadMode === 'today'

  return (
    <section className="spread">
      <div ref={containerRef} className="container spread-container">
        <SectionHeading kicker="01" label="The Spread" />
        <h2 data-reveal className="serif spread-heading">
          You sell low. Your neighbor buys high. The grid keeps the difference.
        </h2>
        <div className="spread-body">
          <div data-reveal className="spread-chart">
            <div className="spread-bars">
              <div className="spread-bar-col">
                <div
                  className="mono spread-bar-value spread-bar-value-sell"
                  style={{ '--bar-pct': sellPct } as CSSVars}
                >
                  ₹{tween.sell.toFixed(2)}
                </div>
                <div className="spread-bar-fill spread-bar-fill-sell" style={{ '--bar-pct': sellPct } as CSSVars} />
              </div>
              <div className="spread-gap-track">
                <div className="spread-gap-line" style={{ '--bar-pct': sellPct } as CSSVars} />
                <div className="spread-gap-line" style={{ '--bar-pct': buyPct } as CSSVars} />
                <div
                  className="spread-gap-fill"
                  style={{ '--gap-start': sellPct, '--gap-height': gapPct } as CSSVars}
                />
                <div className="spread-gap-label" style={{ '--bar-pct': gapMidPct } as CSSVars}>
                  <div className="mono spread-gap-amount">
                    ₹{gap.toFixed(2)}
                    <span className="spread-gap-unit">/kWh</span>
                  </div>
                  <div className="mono spread-gap-caption">
                    {isToday ? 'VALUE LOST TO THE GRID' : 'NETWORK FEE — THE REST STAYS'}
                  </div>
                </div>
              </div>
              <div className="spread-bar-col">
                <div
                  className="mono spread-bar-value spread-bar-value-buy"
                  style={{ '--bar-pct': buyPct } as CSSVars}
                >
                  ₹{tween.buy.toFixed(2)}
                </div>
                <div className="spread-bar-fill spread-bar-fill-buy" style={{ '--bar-pct': buyPct } as CSSVars} />
              </div>
            </div>
            <div className="spread-captions">
              <div className="mono spread-caption-sell">
                {isToday ? 'FEED-IN TARIFF — THE GRID PAYS YOU' : 'COMMUNITY RATE — YOUR NEIGHBOR PAYS YOU'}
              </div>
              <div className="mono spread-caption-buy">
                {isToday ? 'RETAIL RATE — YOUR NEIGHBOR PAYS' : 'ALL-IN PRICE — RATE + ₹0.40 FEE'}
              </div>
            </div>
          </div>
          <div data-reveal className="spread-copy">
            <div className="spread-toggle">
              <button
                type="button"
                onClick={() => setMode('today', true)}
                className={`mono spread-toggle-btn${isToday ? ' spread-toggle-btn-active' : ''}`}
              >
                THE GRID TODAY
              </button>
              <button
                type="button"
                onClick={() => setMode('volt', true)}
                className={`mono spread-toggle-btn spread-toggle-btn-right${!isToday ? ' spread-toggle-btn-active' : ''}`}
              >
                WITH VOLT
              </button>
            </div>
            <p className="spread-lead">
              {isToday
                ? 'The grid buys your surplus at ₹3.00 and sells it next door at ₹8.00. The ₹5.00 spread — sixty-two percent of the retail price — leaves your street entirely.'
                : 'Volt clears the same trade at the community rate. You earn ₹2.50 more per unit, your neighbor saves ₹2.10, and ₹0.40 runs the network.'}
            </p>
            <p className="spread-subbody">
              {isToday
                ? 'Nothing about that spread reflects cost. The electron travels forty meters. The money travels to a balance sheet three districts away.'
                : 'Same panels, same wires, same afternoon. The only thing that changed is who the market belongs to.'}
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

export default Spread
