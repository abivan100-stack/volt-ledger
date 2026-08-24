import { useMemo, useState } from 'react'
import { useEnergyStore } from '../../store/useEnergyStore'
import { inspectBlock, type BlockProof } from '../../lib/proofInspector'
import { shortHash } from '../../lib/format'
import type { ChainBlock } from '../../lib/hashChain'
import './ProofInspector.css'

const VISIBLE_COUNT = 12

interface Row {
  block: ChainBlock
  proof: BlockProof
}

function ProofInspector() {
  const chain = useEnergyStore((state) => state.chain)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [showFull, setShowFull] = useState(false)

  // Recomputed live, right here, every time the chain changes — not read from
  // block.invalid/block.calc (those belong to the store's own validateChain pass).
  const rows: Row[] = useMemo(() => {
    const startIndex = Math.max(0, chain.length - VISIBLE_COUNT)
    const result: Row[] = []
    for (let i = chain.length - 1; i >= startIndex; i--) {
      result.push({ block: chain[i], proof: inspectBlock(chain, i) })
    }
    return result
  }, [chain])

  if (rows.length === 0) return null

  const selected = rows.find((row) => row.block.id === selectedId) ?? rows[0]
  const format = (hash: string) => (showFull ? hash : shortHash(hash))

  return (
    <div id="proof-inspector" className="proof-inspector">
      <div className="proof-inspector-header">
        <h2 className="serif proof-inspector-title">
          Proof inspector <span className="proof-inspector-title-sub">· live hash recomputation</span>
        </h2>
        <button type="button" onClick={() => setShowFull((value) => !value)} className="mono proof-inspector-toggle">
          {showFull ? 'TRUNCATE HASHES' : 'SHOW FULL HASH'}
        </button>
      </div>

      <div className="proof-inspector-picker">
        {rows.map(({ block, proof }) => {
          const ok = proof.ownHashMatches && proof.linkMatches
          const isActive = block.id === selected.block.id
          return (
            <button
              key={block.id}
              type="button"
              onClick={() => setSelectedId(block.id)}
              className={`mono proof-inspector-picker-item${isActive ? ' proof-inspector-picker-item-active' : ''}${ok ? '' : ' proof-inspector-picker-item-broken'}`}
            >
              <span className="proof-inspector-picker-dot" />
              <span className="proof-inspector-picker-time">{block.payload.t}</span>
              <span className="proof-inspector-picker-parties">
                {block.payload.from} → {block.payload.to}
              </span>
              <span className="proof-inspector-picker-kwh">{block.payload.kwh.toFixed(2)} kWh</span>
            </button>
          )
        })}
      </div>

      <div className="proof-inspector-detail">
        <div className="proof-inspector-check">
          <div className="eyebrow proof-inspector-check-label">This block's own hash</div>
          <div className="mono proof-inspector-value-row">
            <span className="proof-inspector-value-label">STORED</span>
            <span className="proof-inspector-value">{format(selected.proof.storedHash)}</span>
          </div>
          <div className="mono proof-inspector-value-row">
            <span className="proof-inspector-value-label">RECOMPUTED NOW</span>
            <span className="proof-inspector-value">{format(selected.proof.recomputedHash)}</span>
          </div>
          <div
            className={`mono proof-inspector-status ${selected.proof.ownHashMatches ? 'proof-inspector-status-match' : 'proof-inspector-status-mismatch'}`}
          >
            {selected.proof.ownHashMatches ? 'MATCH' : 'MISMATCH'}
          </div>
        </div>

        <div className="proof-inspector-check">
          <div className="eyebrow proof-inspector-check-label">Link to previous block</div>
          <div className="mono proof-inspector-value-row">
            <span className="proof-inspector-value-label">PREVIOUS BLOCK'S HASH, NOW</span>
            <span className="proof-inspector-value">{format(selected.proof.previousRecomputedHash)}</span>
          </div>
          <div className="mono proof-inspector-value-row">
            <span className="proof-inspector-value-label">STORED PREV-HASH FIELD</span>
            <span className="proof-inspector-value">{format(selected.proof.storedPrevHash)}</span>
          </div>
          <div
            className={`mono proof-inspector-status ${selected.proof.linkMatches ? 'proof-inspector-status-match' : 'proof-inspector-status-mismatch'}`}
          >
            {selected.proof.linkMatches ? 'MATCH' : 'MISMATCH'}
          </div>
        </div>
      </div>

      <div className="mono proof-inspector-footnote">
        RECOMPUTED LIVE FROM LIB/HASHCHAIN.TS EVERY TIME THE CHAIN CHANGES — NOT READ FROM A STORED VALID FLAG.
        TAMPER A FIGURE ABOVE, THEN STEP THROUGH THE BLOCKS AFTER IT: THE LINK CHECK FAILS FOR EVERY ONE OF THEM.
      </div>
    </div>
  )
}

export default ProofInspector
