import { useRef } from 'react'
import { Building2, IndianRupee, Users, Megaphone } from 'lucide-react'
import SectionHeading from '../ui/SectionHeading'
import { useScrollReveal } from '../../hooks/useScrollReveal'
import './BusinessModel.css'

function BusinessModel() {
  const sectionRef = useRef<HTMLElement>(null)
  useScrollReveal(sectionRef, 0.12)

  return (
    <section id="business-model" ref={sectionRef} className="business-model">
      <div className="container business-model-container">
        <SectionHeading kicker="05" label="Business Model" />
        <h2 data-reveal className="serif business-model-heading">
          A street pays for trust. Not for electrons.
        </h2>
        <p data-reveal className="business-model-intro">
          Volt is neighbourhood SaaS — sold to the society, not the household. The live ledger is the
          sales room: run the Nolambur replay, hit tamper test, watch the chain void itself.
        </p>

        <div className="business-model-grid">
          <div data-reveal className="business-model-card">
            <div className="business-model-card-head">
              <span className="business-model-icon-wrap business-model-icon-sun">
                <Building2 size={18} />
              </span>
              <span className="mono business-model-kicker">Business model</span>
            </div>
            <h3 className="serif business-model-card-title">Society subscription. Not per-meter.</h3>
            <ul className="business-model-list">
              <li>Flat per-society / month — scales by households, not kWh</li>
              <li>6–8% facilitation share on peer-to-peer credit, capped monthly</li>
              <li>DISCOM & audit exports are paid add-ons, not prerequisites</li>
            </ul>
          </div>

          <div data-reveal className="business-model-card business-model-card-delay-1">
            <div className="business-model-card-head">
              <span className="business-model-icon-wrap business-model-icon-settle">
                <IndianRupee size={18} />
              </span>
              <span className="mono business-model-kicker">Price margins — synthetic</span>
            </div>
            <h3 className="serif business-model-card-title">The spread is the product.</h3>
            <div className="business-model-metrics">
              <div className="business-model-metric">
                <span className="mono business-model-metric-label">Seller uplift</span>
                <span className="serif business-model-metric-value">+₹2.5</span>
                <span className="mono business-model-metric-sub">₹5.5 vs ₹3 buyback / kWh</span>
              </div>
              <div className="business-model-metric">
                <span className="mono business-model-metric-label">Buyer saving</span>
                <span className="serif business-model-metric-value">−₹2.5</span>
                <span className="mono business-model-metric-sub">₹5.5 vs ₹8 retail / kWh</span>
              </div>
              <div className="business-model-metric business-model-metric-accent">
                <span className="mono business-model-metric-label">Volt margin</span>
                <span className="serif business-model-metric-value">6–8%</span>
                <span className="mono business-model-metric-sub">capped / month · street keeps ~92%</span>
              </div>
            </div>
            <div className="business-model-profit-bar">
              <span className="mono business-model-profit-label">Profit on spread</span>
              <span className="business-model-profit-text">₹2.5 kept on-street per kWh traded — Volt takes only the facilitation share, rest is seller uplift + buyer saving.</span>
            </div>
            <p className="mono business-model-note">Nolambur demo figures — estimated credits, not bills.</p>
          </div>

          <div data-reveal className="business-model-card business-model-card-delay-2">
            <div className="business-model-card-head">
              <span className="business-model-icon-wrap business-model-icon-ink">
                <Users size={18} />
              </span>
              <span className="mono business-model-kicker">Target audience</span>
            </div>
            <h3 className="serif business-model-card-title">Where roofs already exist.</h3>
            <ul className="business-model-list">
              <li>
                <strong>Primary:</strong> gated societies 40–200 homes — TN, KA, MH
              </li>
              <li>
                <strong>Also:</strong> RWAs, townships, campus microgrids
              </li>
              <li>
                <strong>Sweet spot:</strong> &gt;30% rooftop + a treasurer who reconciles DG/solar
              </li>
            </ul>
          </div>

          <div data-reveal className="business-model-card business-model-card-delay-3">
            <div className="business-model-card-head">
              <span className="business-model-icon-wrap business-model-icon-sun">
                <Megaphone size={18} />
              </span>
              <span className="mono business-model-kicker">Go-to-market</span>
            </div>
            <h3 className="serif business-model-card-title">Demo, not deck.</h3>
            <ul className="business-model-list">
              <li>Pilot-in-a-box: Nolambur replay + tamper demo for committee</li>
              <li>Committee → committee referrals — housing societies trust neighbours</li>
              <li>Channel: solar EPCs & facility managers who own the roof relationship</li>
            </ul>
          </div>
        </div>

        <div data-reveal className="business-model-cta">
          <span className="mono business-model-cta-label">Live proof</span>
          <span className="business-model-cta-text">
            Open the live ledger — the 60-second tour ends with the tamper test. That failure cascade is the pitch.
          </span>
        </div>
      </div>
    </section>
  )
}

export default BusinessModel
