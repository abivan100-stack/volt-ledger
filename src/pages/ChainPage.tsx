import LedgerPageFrame from './LedgerPageFrame'
import ChainLedger from '../components/sections/ChainLedger'
import ProofInspector from '../components/sections/ProofInspector'

function ChainPage() {
  return (
    <LedgerPageFrame
      kicker="04 · The chain"
      title={<>A record that refuses to <em>lie.</em></>}
      body="Every settlement is sealed against the one before it. Edit a figure, watch the chain break, then re-seal the live scenario."
    >
      <ChainLedger />
      <ProofInspector />
    </LedgerPageFrame>
  )
}

export default ChainPage
