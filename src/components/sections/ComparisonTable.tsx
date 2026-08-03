import { useRef } from 'react'
import { useScrollReveal } from '../../hooks/useScrollReveal'
import './ComparisonTable.css'

interface ComparisonRow {
  label: string
  labelAccent?: boolean
  database: string
  volt: string
}

const ROWS: ComparisonRow[] = [
  {
    label: 'WRITES',
    database: 'One operator writes. Fast, cheap, final.',
    volt: 'Any household writes; every other household verifies.',
  },
  {
    label: 'TAMPERING',
    database: 'Silent. An edited row looks like any other row.',
    volt: 'Loud. One changed digit voids every entry after it — you just saw it.',
  },
  {
    label: 'COST',
    database: 'Near zero. This column wins on price, honestly.',
    volt: "Real overhead — hashing and replication aren't free.",
  },
  {
    label: 'DISPUTES',
    database: 'Escalate to the operator, and hope.',
    volt: 'Replay the chain. The math settles it.',
  },
  {
    label: 'VERDICT',
    labelAccent: true,
    database: "Right when there's a utility everyone already trusts.",
    volt: 'Right when the operator is the thing in question.',
  },
]

function ComparisonTable() {
  const sectionRef = useRef<HTMLElement>(null)
  useScrollReveal(sectionRef, 0.12)

  return (
    <section ref={sectionRef} className="comparison">
      <div className="container comparison-container">
        <div data-reveal className="comparison-kicker">
          <span className="mono comparison-kicker-number">04</span>
          <span className="eyebrow">Trade-offs</span>
        </div>
        <h2 data-reveal className="serif comparison-heading">Why not just a database?</h2>
        <p data-reveal className="comparison-intro">
          Because a database would work — if everyone agreed to trust whoever runs it. Volt's bet is narrower:
          neighbors settling money with each other shouldn't have to.
        </p>
        <div data-reveal role="table" className="comparison-table">
          <div role="rowgroup">
            <div className="mono comparison-row comparison-header-row">
              <span role="columnheader" />
              <span role="columnheader">A TRUSTED DATABASE</span>
              <span role="columnheader" className="comparison-header-volt">THE VOLT LEDGER</span>
            </div>
          </div>
          <div role="rowgroup">
            {ROWS.map((row) => (
              <div key={row.label} role="row" className="comparison-row comparison-data-row">
                <span role="cell" className={`mono comparison-row-label${row.labelAccent ? ' comparison-row-label-accent' : ''}`}>
                  {row.label}
                </span>
                <span role="cell" className="comparison-cell comparison-cell-database">{row.database}</span>
                <span role="cell" className="comparison-cell">{row.volt}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

export default ComparisonTable
