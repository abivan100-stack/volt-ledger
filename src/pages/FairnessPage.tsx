import LedgerPageFrame from './LedgerPageFrame'
import FairnessScore from '../components/sections/FairnessScore'

function FairnessPage() {
  return (
    <LedgerPageFrame
      kicker="03 · Fairness"
      title={<>Who <em>benefits?</em></>}
      body="A transparent view of today’s exchange: what each household earned selling surplus, less what it spent buying."
    >
      <FairnessScore />
    </LedgerPageFrame>
  )
}

export default FairnessPage
