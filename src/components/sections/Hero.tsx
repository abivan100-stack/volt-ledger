import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useEnergyStore } from '../../store/useEnergyStore'
import { scrollToId } from '../../utils/scrollToId'
import { useScrollReveal } from '../../hooks/useScrollReveal'
import { prefersReducedMotion } from '../../utils/prefersReducedMotion'
import PrimaryLinkButton from '../ui/PrimaryLinkButton'
import { startHeroMesh } from './canvas/heroMeshCanvas'
import './Hero.css'

function Hero() {
  const sectionRef = useRef<HTMLElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const activity = useEnergyStore((state) => state.config.activity)

  useScrollReveal(sectionRef, 0.12)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    return startHeroMesh(canvas, { activity, reducedMotion: prefersReducedMotion() })
  }, [activity])

  return (
    <section ref={sectionRef} className="hero">
      <div className="container hero-row">
        <div className="hero-copy" data-reveal>
          <div className="hero-kicker">
            <span className="hero-kicker-bar" />
            <span className="eyebrow">Peer-to-Peer Solar · Nolambur Microgrid</span>
          </div>
          <h1 className="serif hero-headline">
            Your rooftop's <em className="hero-headline-em">surplus</em>, sold to your street — not the grid.
          </h1>
          <p className="hero-subhead">
            Volt turns your neighborhood into a fair, transparent energy market. Every kilowatt tracked, every
            trade sealed against tampering.
          </p>
          <div className="hero-ctas">
            <PrimaryLinkButton to="/ledger">SEE THE LEDGER LIVE →</PrimaryLinkButton>
            <button type="button" onClick={() => scrollToId('how')} className="mono hero-cta-secondary">
              HOW IT WORKS
            </button>
          </div>
          <Link to="/ledger" className="mono hero-live-link">
            <span className="hero-live-dot" />
            LIVE — SETTLING NOW ON THE NOLAMBUR LEDGER →
          </Link>
        </div>
        <div className="hero-canvas-wrap">
          <canvas ref={canvasRef} aria-hidden="true" className="hero-canvas" />
        </div>
      </div>
    </section>
  )
}

export default Hero
