import { memo } from 'react'
import type { ChainBlock } from '../../lib/hashChain'
import { shortHash } from '../../lib/format'
import './ChainLedgerRow.css'

interface ChainLedgerRowProps {
  block: ChainBlock
  isEditing: boolean
  editValue: string
  onStartEdit: (id: number) => void
  onEditValueChange: (value: string) => void
  onCommitEdit: () => void
  onCancelEdit: () => void
}

function ChainLedgerRow({
  block,
  isEditing,
  editValue,
  onStartEdit,
  onEditValueChange,
  onCommitEdit,
  onCancelEdit,
}: ChainLedgerRowProps) {
  return (
    <div className={`mono chain-row${block.invalid ? ' chain-row-invalid' : ''}`}>
      <span className="chain-row-time">{block.payload.t}</span>
      <span className="chain-row-parties">
        {block.payload.from} <span className="chain-row-arrow">→</span> {block.payload.to}
      </span>
      {isEditing ? (
        <input
          value={editValue}
          onChange={(event) => onEditValueChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
            if (event.key === 'Escape') onCancelEdit()
          }}
          onBlur={onCommitEdit}
          autoFocus
          className="mono chain-row-edit-input"
        />
      ) : (
        <button
          type="button"
          onClick={() => onStartEdit(block.id)}
          title="Tamper: edit this figure"
          className="mono chain-row-kwh-button"
        >
          {block.payload.kwh.toFixed(2)}
        </button>
      )}
      <span className="chain-row-credit">+₹{block.payload.credit.toFixed(2)}</span>
      <span className="chain-row-seal">
          {block.invalid ? (
            <>
              <span className="chain-void-badge">VOID</span>
              <span className="chain-row-calc">{shortHash(block.calc || '')}</span>
            </>
          ) : (
            <span className="chain-row-hash">{shortHash(block.hash)}</span>
          )}
      </span>
    </div>
  )
}

export default memo(ChainLedgerRow)
