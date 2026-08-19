import LedgerPageFrame from './LedgerPageFrame'
import AutonomyScore from '../components/sections/AutonomyScore'
import DayTypeSelector from '../components/sections/DayTypeSelector'
import SimulationControls from '../components/sections/SimulationControls'
import StatsStrip from '../components/sections/StatsStrip'
import CarbonCounter from '../components/sections/CarbonCounter'
import GridDependenceMeter from '../components/sections/GridDependenceMeter'

function LedgerPage() {
  return (
    <LedgerPageFrame
      kicker="01 · Live overview · Nolambur microgrid, Chennai"
      title={<>Watch the street <em>settle.</em></>}
      body="Ten households on one rooftop-solar street, simulated through a single afternoon. Set the conditions, then follow the energy that stays local."
    >
      <AutonomyScore />
      <DayTypeSelector />
      <SimulationControls />
      <StatsStrip />
      <CarbonCounter />
      <GridDependenceMeter />
    </LedgerPageFrame>
  )
}

export default LedgerPage
