import { useRef } from 'react'
import SectionHeading from '../ui/SectionHeading'
import { useScrollReveal } from '../../hooks/useScrollReveal'
import './HowItWorks.css'

interface Step {
  number: string
  title: string
  accentColor: 'sun' | 'settle'
  body: string
}

const STEPS: Step[] = [
  {
    number: '01',
    title: 'Generate',
    accentColor: 'sun',
    body: "Your panels make more than you use. That surplus used to be the grid's bargain — now it's your inventory.",
  },
  {
    number: '02',
    title: 'Log',
    accentColor: 'sun',
    body: 'Surplus is recorded to the shared ledger — hashed, signed, and chained to every entry before it.',
  },
  {
    number: '03',
    title: 'Settle',
    accentColor: 'settle',
    body: "A neighbor draws it down. Credit moves, balances update — and the record can't quietly change.",
  },
]

function HowItWorks() {
  const sectionRef = useRef<HTMLElement>(null)
  useScrollReveal(sectionRef, 0.12)

  return (
    <section id="how" ref={sectionRef} className="how">
      <div className="container how-container">
        <SectionHeading kicker="02" label="How it works" />
        <h2 data-reveal className="serif how-heading">Three steps. No middleman.</h2>
        <div className="how-grid">
          {STEPS.map((step, index) => (
            <div key={step.number} data-reveal className={`how-card${index > 0 ? ` how-card-delay-${index}` : ''}`}>
              <div className={`serif how-card-number how-card-number-${step.accentColor}`}>{step.number}</div>
              <h3 className="serif how-card-title">{step.title}</h3>
              <p className="how-card-body">{step.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export default HowItWorks
