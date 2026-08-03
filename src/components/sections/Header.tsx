import type { MouseEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useEnergyStore } from '../../store/useEnergyStore'
import { scrollToId, scrollToTop } from '../../utils/scrollToId'
import './Header.css'

function handleHowItWorksClick(event: MouseEvent<HTMLAnchorElement>) {
  event.preventDefault()
  scrollToId('how')
}

function Header() {
  const location = useLocation()
  const isLedgerPage = location.pathname === '/ledger'
  const rate = useEnergyStore((state) => state.rate)

  const logo = (
    <>
      <span className="header-logo-dot" />
      <span className="header-logo-word">VOLT</span>
      <span className="serif header-logo-suffix">Ledger</span>
    </>
  )

  return (
    <header className="header">
      <div className="container header-bar">
        {isLedgerPage ? (
          <Link to="/" className="header-logo" aria-label="Volt — back to home">
            {logo}
          </Link>
        ) : (
          <button
            type="button"
            className="header-logo header-logo-btn"
            onClick={scrollToTop}
            aria-label="Volt — back to top"
          >
            {logo}
          </button>
        )}
        <nav className="header-nav">
          {isLedgerPage ? (
            <Link to="/" className="mono header-link">← HOME</Link>
          ) : (
            <>
              <a href="#how" className="mono header-link" onClick={handleHowItWorksClick}>HOW IT WORKS</a>
              <Link to="/ledger" className="mono header-link">LIVE LEDGER →</Link>
            </>
          )}
          <span className="mono header-rate">
            <span className="header-rate-dot" />
            ₹{rate.toFixed(2)}/kWh
          </span>
        </nav>
      </div>
    </header>
  )
}

export default Header
