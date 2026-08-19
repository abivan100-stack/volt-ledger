import type { ReactNode } from 'react'
import { useRef } from 'react'
import Header from '../components/sections/Header'
import Footer from '../components/sections/Footer'
import DossierDrawer from '../components/sections/DossierDrawer'
import { useScrollReveal } from '../hooks/useScrollReveal'
import './LedgerPage.css'
import './LedgerPageFrame.css'

interface LedgerPageFrameProps {
  kicker: string
  title: ReactNode
  body: string
  children: ReactNode
}

function LedgerPageFrame({ kicker, title, body, children }: LedgerPageFrameProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  useScrollReveal(containerRef, 0.08)

  return (
    <>
      <Header />
      <main id="main">
        <section className="ledger-page-wrap">
          <div ref={containerRef} className="container ledger-page-inner ledger-frame-inner">
            <div className="ledger-frame-heading">
              <div data-reveal className="ledger-frame-kicker">
                <span className="ledger-frame-kicker-bar" />
                <span className="eyebrow">{kicker}</span>
              </div>
              <h1 data-reveal className="serif ledger-frame-title">{title}</h1>
              <p data-reveal className="ledger-frame-body">{body}</p>
            </div>
            {children}
          </div>
        </section>
      </main>
      <Footer />
      <DossierDrawer />
    </>
  )
}

export default LedgerPageFrame
