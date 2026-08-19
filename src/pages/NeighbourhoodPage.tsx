import LedgerPageFrame from './LedgerPageFrame'
import NeighbourhoodMap from '../components/sections/NeighbourhoodMap'
import HouseholdGrid from '../components/sections/HouseholdGrid'

function NeighbourhoodPage() {
  return (
    <LedgerPageFrame
      kicker="02 · The neighbourhood"
      title={<>Meet the <em>street.</em></>}
      body="See where energy is being made, shared, and drawn right now. Select any household to open its live dossier."
    >
      <NeighbourhoodMap />
      <HouseholdGrid />
    </LedgerPageFrame>
  )
}

export default NeighbourhoodPage
