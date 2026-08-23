import type { MouseEvent } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { Zap } from 'lucide-react'
import { isApiConfigured } from '../../api/config'
import { useEnergyStore } from '../../store/useEnergyStore'
import { scrollToId, scrollToTop } from '../../utils/scrollToId'
import ThemeToggle from '../ui/ThemeToggle'
import './Header.css'

function handleHowItWorksClick(event: MouseEvent<HTMLAnchorElement>) {
  event.preventDefault()
  scrollToId('how')
}

function Header() {
  const location = useLocation()
  const isHomePage = location.pathname === '/'
  const isLedgerPage = location.pathname.startsWith('/ledger')
  const rate = useEnergyStore((state) => state.rate)
  // The demo needs no account, so the link only appears where one can be used.
  const accountAvailable = isApiConfigured()

  const logo = (
    <>
      <Zap className="header-logo-bolt" aria-hidden="true" />
      <span className="header-logo-word">VOLT</span>
      <span className="serif header-logo-suffix">Ledger</span>
    </>
  )

  return (
    <header className="header">
      <div className="container header-bar">
        {isHomePage ? (
          <button
            type="button"
            className="header-logo header-logo-btn"
            onClick={scrollToTop}
            aria-label="Volt — back to top"
          >
            {logo}
          </button>
        ) : (
          // Anywhere that is not the home page — the ledger, the account page,
          // invitation acceptance, the 404 — "back to top" would only scroll
          // whatever page is already showing. The logo has to actually navigate.
          <Link to="/" className="header-logo" aria-label="Volt — back to home">
            {logo}
          </Link>
        )}
        <nav className="header-nav">
          {isLedgerPage ? (
            <>
              <Link to="/" className="mono header-link header-home-link">← HOME</Link>
              <div className="header-ledger-nav" aria-label="Ledger views">
                <NavLink end to="/ledger" className="mono header-link">OVERVIEW</NavLink>
                <NavLink to="/ledger/neighbourhood" className="mono header-link">NEIGHBOURHOOD</NavLink>
                <NavLink to="/ledger/settlement" className="mono header-link">SETTLEMENT</NavLink>
              </div>
            </>
          ) : (
            <>
              {isHomePage ? (
                <a href="#how" className="mono header-link" onClick={handleHowItWorksClick}>HOW IT WORKS</a>
              ) : (
                // "How it works" lives only on the home page. Off it — the
                // account page, invitation acceptance, 404 — there is no `#how`
                // element for an in-place scroll to find, so this has to
                // navigate home first; VoltPage scrolls to it once there.
                <Link to="/#how" className="mono header-link">HOW IT WORKS</Link>
              )}
              <Link to="/ledger" className="mono header-link">LIVE LEDGER →</Link>
            </>
          )}
          {accountAvailable && (
            <Link to="/account" className="mono header-link">ACCOUNT</Link>
          )}
          <span className="mono header-rate">
            <span className="header-rate-dot" />
            ₹{rate.toFixed(2)}/kWh
          </span>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  )
}

export default Header
