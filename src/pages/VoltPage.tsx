import Header from '../components/sections/Header'
import Hero from '../components/sections/Hero'
import Spread from '../components/sections/Spread'
import HowItWorks from '../components/sections/HowItWorks'
import LedgerCta from '../components/sections/LedgerCta'
import ComparisonTable from '../components/sections/ComparisonTable'
import Footer from '../components/sections/Footer'

function VoltPage() {
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
