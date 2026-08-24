import { useRef } from 'react'
import SectionHeading from '../ui/SectionHeading'
import { useScrollReveal } from '../../hooks/useScrollReveal'
import './BusinessModel.css'

interface BusinessCard {
  kicker: string
  title: string
  body: string
  bullets: string[]
  note?: string
}

const CARDS: BusinessCard[] = [
  {
    kicker: 'Business model',
    title: 'Neighbourhood SaaS, not a utility',
    body: 'Volt is sold to the organisation that owns the street — a housing society, RWA, or microgrid operator — as a single subscription. No per-meter hardware lock-in.',
    bullets: [
      'SaaS per-organisation / month, scales with households — not kWh',
      'Optional settlement facilitation fee (platform % on peer-to-peer kWh) disclosed at the society level',
      'DISCOM and audit exports are value-add modules, not prerequisites',
    ],
    note: 'Simulated rates shown elsewhere (₹5.5 community / ₹3 buyback / ₹8 retail) are illustrative, not a tariff.',
  },
  {
    kicker: 'Price margins',
    title: 'The spread pays for trust',
    body: 'Between grid buyback and retail sits the margin Volt helps a street keep. Volt does not set the price — it makes the spread transparent.',
    bullets: [
      'Synthetic example: sell at ₹5.5 vs ₹3 buyback → +₹2.5/kWh uplift for sellers',
      'Buy at ₹5.5 vs ₹8 retail → −₹2.5/kWh saving for buyers',
      'Volt fee modelled at 6–8% of settled peer-to-peer credit, capped monthly',
    ],
    note: 'All figures are synthetic estimates for the Nolambur demo — not bills.',
  },
  {
    kicker: 'Target audience',
    title: 'Start where the roofs already exist',
    body: 'Volt fits any street where proximity makes wire-loss negligible and governance already exists.',
    bullets: [
      'Primary: gated communities & housing societies (40–200 homes) in Tamil Nadu, Karnataka, Maharashtra',
      'Secondary: RWAs, builder-managed townships, campus microgrids',
      'Early adopters: societies with >30% rooftop coverage and a resident treasurer who already reconciles DG/solar accounts',
    ],
  },
  {
    kicker: 'Marketing strategy',
    title: 'One live street beats a deck',
    body: 'Volt sells by running, not pitching. The live ledger is the proof room.',
    bullets: [
      'Pilot-in-a-box: Nolambur replay + tamper demo for the first committee meeting',
      'Society-to-society referrals — committee introduces committee',
      'Channel partners: solar EPCs and facility managers who already own the roof relationship',
      'Content: monthly settlement transparency digest that a treasurer can forward on WhatsApp',
    ],
  },
]

function BusinessModel() {
  const sectionRef = useRef<HTMLElement>(null)
  useScrollReveal(sectionRef, 0.12)

  return (
    <section id="business-model" ref={sectionRef} className="business-model">
      <div className="container business-model-container">
        <SectionHeading kicker="05" label="Business Model" />
        <h2 data-reveal className="serif business-model-heading">
          Earn trust first. The margin follows.
        </h2>
        <p data-reveal className="business-model-intro">
          Volt does not generate power and does not guarantee income. It keeps a street&apos;s own
          settlement honest so the value that is already on the roof is not lost to an opaque buyback.
          The model is simple — subscription plus a capped, transparent facilitation share.
        </p>

        <div className="business-model-grid">
          {CARDS.map((card, index) => (
            <div
              key={card.kicker}
              data-reveal
              className={`business-model-card${index > 0 ? ` business-model-card-delay-${index}` : ''}`}
            >
              <div className="mono business-model-kicker">{card.kicker}</div>
              <h3 className="serif business-model-card-title">{card.title}</h3>
              <p className="business-model-card-body">{card.body}</p>
              <ul className="business-model-list">
                {card.bullets.map((item) => (
                  <li key={item} className="business-model-list-item">
                    {item}
                  </li>
                ))}
              </ul>
              {card.note ? <p className="mono business-model-note">{card.note}</p> : null}
            </div>
          ))}
        </div>

        <div data-reveal className="business-model-foot">
          <div className="mono business-model-foot-label">Synthetic neighbourhood · Nolambur replay</div>
          <div className="business-model-foot-note">
            Figures above illustrate how a community rate between buyback and retail creates a shared
            surplus. Every rupee shown in the simulation is an estimated credit — not a payment.
          </div>
        </div>
      </div>
    </section>
  )
}

export default BusinessModel
