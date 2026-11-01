import { useRef } from 'react'
import SectionHeading from '../ui/SectionHeading'
import { useScrollReveal } from '../../hooks/useScrollReveal'
import './PolicyComparison.css'

interface PolicyRow {
  dimension: string
  tangedco: string
  volt: string
  highlight?: boolean
}

const POLICY_ROWS: PolicyRow[] = [
  {
    dimension: 'PROSUMER EXPORT TARIFF',
    tangedco: '₹3.10 / kWh (Fixed DISCOM net-feed-in credit)',
    volt: '₹5.50 / kWh (+77% higher earnings for solar owners)',
    highlight: true,
  },
  {
    dimension: 'NEIGHBOUR IMPORT TARIFF',
    tangedco: '₹7.50 – ₹9.00 / kWh (Peak residential grid slabs)',
    volt: '₹5.50 / kWh (28% – 38% cheaper than utility power)',
    highlight: true,
  },
  {
    dimension: 'APARTMENT / TENANT ACCESS',
    tangedco: '0% access — requires registered rooftop ownership',
    volt: '100% access — renters buy clean solar directly from peers',
  },
  {
    dimension: 'FINANCIAL SETTLEMENT SPEED',
    tangedco: '30 to 60 days delayed via bi-monthly utility bills',
    volt: 'Real-time peer settlement on every 15-minute interval',
  },
  {
    dimension: 'RECORD AUDITABILITY',
    tangedco: 'Opaque DISCOM bill summaries with no granular logs',
    volt: 'Cryptographically sealed SHA-256 tamper-evident ledger',
  },
]

function PolicyComparison() {
  const sectionRef = useRef<HTMLElement>(null)
  useScrollReveal(sectionRef, 0.12)

  return (
    <section ref={sectionRef} id="policy-context" className="policy-section">
      <div className="container policy-container">
        <SectionHeading kicker="04" label="Regulatory Context" />
        <h2 data-reveal className="serif policy-heading">
          Bridging the <em>Tamil Nadu</em> DISCOM spread.
        </h2>
        <p data-reveal className="policy-intro">
          Under current utility rules, rooftop solar owners sell surplus for ₹3.10/kWh while neighbours next door
          pay up to ₹9.00/kWh for peak grid power. Volt bridges this regulatory gap through local peer-to-peer
          microgrid settlement under CERC guidelines.
        </p>

        <div data-reveal role="table" className="policy-table" aria-label="TANGEDCO vs Volt Comparison">
          <div role="rowgroup">
            <div className="mono policy-row policy-header-row">
              <span role="columnheader" className="policy-col-dim">DIMENSION</span>
              <span role="columnheader" className="policy-col-tangedco">TANGEDCO NET-FEED TARIFF</span>
              <span role="columnheader" className="policy-col-volt">VOLT P2P MICROGRID</span>
            </div>
          </div>
          <div role="rowgroup">
            {POLICY_ROWS.map((row) => (
              <div key={row.dimension} role="row" className={`policy-row policy-data-row${row.highlight ? ' policy-row-highlight' : ''}`}>
                <span role="cell" className="mono policy-cell-dim">
                  {row.dimension}
                </span>
                <span role="cell" className="policy-cell-tangedco">
                  {row.tangedco}
                </span>
                <span role="cell" className="policy-cell-volt">
                  {row.volt}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div data-reveal className="policy-citations">
          <div className="policy-citation-card">
            <span className="mono policy-citation-tag">REGULATORY ALIGNMENT</span>
            <h4 className="serif policy-citation-title">CERC P2P Discussion Framework</h4>
            <p className="policy-citation-text">
              Aligned with Central Electricity Regulatory Commission staff recommendations for blockchain and
              ledger-based peer-to-peer energy settlement on local distribution networks.
            </p>
          </div>

          <div className="policy-citation-card">
            <span className="mono policy-citation-tag">STATE SOLAR POLICY</span>
            <h4 className="serif policy-citation-title">Tamil Nadu Solar Policy 2019</h4>
            <p className="policy-citation-text">
              Designed to accelerate the state's 9,000 MW renewable target by unlocking monetization for urban
              prosumers and high-density residential streets in Chennai.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

export default PolicyComparison
