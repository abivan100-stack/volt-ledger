import { useRef } from 'react'
import Header from '../components/sections/Header'
import LedgerIntro from '../components/sections/LedgerIntro'
import AutonomyScore from '../components/sections/AutonomyScore'
import DayTypeSelector from '../components/sections/DayTypeSelector'
import StatsStrip from '../components/sections/StatsStrip'
import CarbonCounter from '../components/sections/CarbonCounter'
import GridDependenceMeter from '../components/sections/GridDependenceMeter'
import NeighbourhoodMap from '../components/sections/NeighbourhoodMap'
import HouseholdGrid from '../components/sections/HouseholdGrid'
import FairnessScore from '../components/sections/FairnessScore'
import ChainLedger from '../components/sections/ChainLedger'
import ProofInspector from '../components/sections/ProofInspector'
import Footer from '../components/sections/Footer'
import DossierDrawer from '../components/sections/DossierDrawer'
import { useScrollReveal } from '../hooks/useScrollReveal'

function LedgerPage() {
  const containerRef = useRef<HTMLDivElement>(null)
  useScrollReveal(containerRef, 0.08)

  return (
    <>
      <Header />
      <section className="border-b border-rule-2">
        <div ref={containerRef} className="container pt-16 pb-32">
          <LedgerIntro />
          <AutonomyScore />
          <DayTypeSelector />
          <StatsStrip />
          <CarbonCounter />
          <GridDependenceMeter />
          <NeighbourhoodMap />
          <HouseholdGrid />
          <FairnessScore />
          <ChainLedger />
          <ProofInspector />
        </div>
      </section>
      <Footer />
      <DossierDrawer />
    </>
  )
}

export default LedgerPage
