import LedgerPageFrame from './LedgerPageFrame'
import ImpactSummary from '../components/sections/ImpactSummary'
import FairnessScore from '../components/sections/FairnessScore'
import ChainLedger from '../components/sections/ChainLedger'
import ProofInspector from '../components/sections/ProofInspector'

function SettlementPage() {
  return (
    <LedgerPageFrame
      kicker="03 · Settlement record"
      title={<>A fair exchange, <em>accounted for.</em></>}
      body="See how value moved through the street, then verify the sealed record behind every settlement. One view for the outcome and the evidence."
    >
      <ImpactSummary />
      <FairnessScore />
      <ChainLedger />
      <ProofInspector />
    </LedgerPageFrame>
  )
}

export default SettlementPage
