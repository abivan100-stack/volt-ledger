import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import Header from '../components/sections/Header'
import './NotFoundPage.css'

function NotFoundPage() {
  useEffect(() => {
    document.title = 'Volt — Route Not Found'
  }, [])

  return (
    <>
      <Header />
      <main className="not-found" id="main">
        <div className="container not-found-grid">
          <div className="not-found-copy">
            <p className="mono not-found-kicker">VOLT / LEDGER / 404</p>
            <p className="serif not-found-code" aria-hidden="true">404</p>
            <h1 className="serif not-found-heading">This street doesn&apos;t lead anywhere.</h1>
            <p className="not-found-body">
              The page you followed has left the network. Let&apos;s route you back to the live neighborhood ledger.
            </p>
            <div className="not-found-actions">
              <Link to="/" className="mono not-found-primary">BACK TO HOMEPAGE →</Link>
              <Link to="/ledger" className="mono not-found-secondary">OPEN LIVE LEDGER</Link>
            </div>
          </div>

          <div className="not-found-network" aria-hidden="true">
            <svg viewBox="0 0 420 360" focusable="false">
              <path className="not-found-wire" d="M72 74 208 44 350 102 286 266 116 292 72 74" />
              <path className="not-found-wire not-found-wire-broken" d="M72 74 116 292M208 44 286 266M350 102 116 292" />
              <circle className="not-found-node" cx="72" cy="74" r="10" />
              <circle className="not-found-node" cx="208" cy="44" r="10" />
              <circle className="not-found-node" cx="350" cy="102" r="10" />
              <circle className="not-found-node" cx="286" cy="266" r="10" />
              <circle className="not-found-node" cx="116" cy="292" r="10" />
              <circle className="not-found-node-center" cx="208" cy="178" r="18" />
              <path className="not-found-bolt" d="m214 148-25 38h18l-5 22 25-39h-18z" />
            </svg>
            <p className="mono not-found-signal">NO ROUTE FOUND <span>•</span> SIGNAL LOST</p>
          </div>
        </div>
      </main>
    </>
  )
}

export default NotFoundPage
