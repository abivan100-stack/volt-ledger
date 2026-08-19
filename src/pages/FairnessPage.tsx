import LedgerPageFrame from './LedgerPageFrame'
import FairnessScore from '../components/sections/FairnessScore'
import ChainLedger from '../components/sections/ChainLedger'
import ProofInspector from '../components/sections/ProofInspector'

function FairnessPage() {
  return (
    <LedgerPageFrame
      kicker="03 · Fairness + proof"
      title={<>Who benefits, and can we <em>prove it?</em></>}
      body="Read the day’s distribution of value, then inspect the sealed record behind it. Fairness shows who gained; the chain shows that the figures are accountable."
    >
      <FairnessScore />
      <ChainLedger />
      <ProofInspector />
    </LedgerPageFrame>
  )
}

export default FairnessPage
