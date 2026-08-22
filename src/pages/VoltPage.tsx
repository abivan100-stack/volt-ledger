import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import Header from '../components/sections/Header'
import Hero from '../components/sections/Hero'
import Spread from '../components/sections/Spread'
import HowItWorks from '../components/sections/HowItWorks'
import LedgerCta from '../components/sections/LedgerCta'
import ComparisonTable from '../components/sections/ComparisonTable'
import Footer from '../components/sections/Footer'
import { scrollToId } from '../utils/scrollToId'

function VoltPage() {
  const location = useLocation()

  useEffect(() => {
    // Reaching this page with #how in the URL means the header's "How it
    // works" link sent someone here from off the home page — React Router does
    // not scroll to a hash on its own, so this section has to.
    if (location.hash === '#how') scrollToId('how')
    // Only the hash present when this page first mounts should scroll it; a
    // later change while already here has nothing to react to.
    // eslint-disable-next-line react/exhaustive-deps
  }, [])

  return (
    <>
      <Header />
      <main id="main">
        <Hero />
        <Spread />
        <HowItWorks />
        <LedgerCta />
        <ComparisonTable />
      </main>
      <Footer />
    </>
  )
}

export default VoltPage
