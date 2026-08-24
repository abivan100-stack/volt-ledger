import { useRef } from 'react'
import SectionHeading from '../ui/SectionHeading'
import { useScrollReveal } from '../../hooks/useScrollReveal'
import './BusinessModel.css'

interface Fact {
  kicker: string
  title: string
  items: string[]
}

const FACTS: Fact[] = [
  {
    kicker: 'Business model',
    title: 'Society SaaS',
    items: ['Per-society / month — by households, not kWh', '6–8% facilitation fee, capped, disclosed', 'DISCOM / audit = paid add-ons'],
  },
  {
    kicker: 'Price margins',
    title: '₹5.5 keeps the spread',
    items: ['Sell ₹5.5 vs ₹3 buyback → +₹2.5 uplift', 'Buy ₹5.5 vs ₹8 retail → −₹2.5 saving', 'Synthetic — not a bill'],
  },
  {
    kicker: 'Target audience',
    title: 'Roofs that exist',
    items: ['Primary: gated soc. 40–200 homes (TN / KA / MH)', 'Also: RWAs, townships, campus grids', 'Sweet spot: >30% roof + treasurer'],
  },
  {
    kicker: 'Marketing',
    title: 'Demo, not deck',
    items: ['Pilot: Nolambur replay + tamper demo', 'Referrals: committee → committee', 'Partners: solar EPCs / facility mgrs'],
  },
]

function BusinessModel() {
  const sectionRef = useRef<HTMLElement>(null)
  useScrollReveal(sectionRef, 0.12)

  return (
    <section id="business-model" ref={sectionRef} className="business-model">
      <div className="container business-model-container">
        <SectionHeading kicker="05" label="At a glance" />
        <div data-reveal className="business-model-fact-box">
          <div className="business-model-fact-head">
            <h2 className="serif business-model-fact-title">Business in one box.</h2>
            <p className="mono business-model-fact-sub">Synthetic Nolambur replay — every ₹ is an estimated credit, not a payment.</p>
          </div>

          <div className="business-model-fact-grid">
            {FACTS.map((fact, index) => (
              <div key={fact.kicker} data-reveal className={`business-model-fact${index > 0 ? ` business-model-fact-delay-${index}` : ''}`}>
                <div className="mono business-model-fact-kicker">{fact.kicker}</div>
                <h3 className="serif business-model-fact-card-title">{fact.title}</h3>
                <ul className="business-model-fact-list">
                  {fact.items.map((item) => (
                    <li key={item} className="business-model-fact-item">{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mono business-model-fact-foot">Subscription + capped facilitation · Judge tip: hit “tamper test” in the live ledger — the chain voids itself.</div>
        </div>
      </div>
    </section>
  )
}

export default BusinessModel
