import { useRef } from 'react'
import { useEnergyStore } from '../../store/useEnergyStore'
import { useScrollReveal } from '../../hooks/useScrollReveal'
import PrimaryLinkButton from '../ui/PrimaryLinkButton'
import './LedgerCta.css'

function LedgerCta() {
  const sectionRef = useRef<HTMLElement>(null)
  const rate = useEnergyStore((state) => state.rate)
  useScrollReveal(sectionRef, 0.12)

  return (
    <section ref={sectionRef} className="ledger-cta">
      <div className="container ledger-cta-row">
        <div data-reveal className="ledger-cta-copy">
          <div className="ledger-cta-kicker">
            <span className="mono ledger-cta-kicker-number">03</span>
            <span className="eyebrow">Live Ledger</span>
          </div>
          <h2 className="serif ledger-cta-heading">Ten households. One shared, tamper-proof record.</h2>
          <p className="ledger-cta-body">
            Open the live ledger to watch a Nolambur street settle through a solar afternoon — real balances, a
            real in-browser hash chain, and a tamper test you can run yourself.
          </p>
          <PrimaryLinkButton to="/ledger">OPEN THE LIVE LEDGER →</PrimaryLinkButton>
        </div>
        <div data-reveal className="ledger-cta-stats">
          <div>
            <div className="eyebrow ledger-cta-stat-label">Households</div>
            <div className="serif ledger-cta-stat-value">10</div>
          </div>
          <div className="ledger-cta-stat-divider">
            <div className="eyebrow ledger-cta-stat-label">Community Rate</div>
            <div className="mono ledger-cta-rate">₹{rate.toFixed(2)}</div>
          </div>
        </div>
      </div>
    </section>
  )
}

export default LedgerCta
