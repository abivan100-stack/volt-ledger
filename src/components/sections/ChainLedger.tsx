import { useEnergyStore } from '../../store/useEnergyStore'
import { chainStatusFor } from '../../lib/chainStatus'
import { chainToCsv, chainToJson } from '../../lib/chainExport'
import { downloadTextFile } from '../../utils/downloadFile'
import ChainLedgerRow from './ChainLedgerRow'
import './ChainLedger.css'

function ChainLedger() {
  const chain = useEnergyStore((state) => state.chain)
  const compromised = useEnergyStore((state) => state.compromised)
  const invalidCount = useEnergyStore((state) => state.invalidCount)
  const restoredFlash = useEnergyStore((state) => state.restoredFlash)
  const editingBlockId = useEnergyStore((state) => state.editingBlockId)
  const editValue = useEnergyStore((state) => state.editValue)
  const startEdit = useEnergyStore((state) => state.startEdit)
  const setEditValue = useEnergyStore((state) => state.setEditValue)
  const commitEdit = useEnergyStore((state) => state.commitEdit)
  const cancelEdit = useEnergyStore((state) => state.cancelEdit)
  const restoreChain = useEnergyStore((state) => state.restoreChain)

  const rows = chain.slice(-10).reverse()

  const exportCsv = () => downloadTextFile('volt-ledger.csv', chainToCsv(chain), 'text/csv')
  const exportJson = () => downloadTextFile('volt-ledger.json', chainToJson(chain), 'application/json')

  const status = chainStatusFor({
    compromised,
    restoredFlash,
    invalidCount,
    chainLength: chain.length,
    headHash: chain.length ? chain[chain.length - 1].hash : null,
  })

  return (
    <div className="chain-block">
      <div className="chain-header">
        <h2 className="serif chain-title">
          The chain <span className="chain-title-sub">· sha-256 sealed</span>
        </h2>
        <div className="mono chain-tamper-hint">TAMPER TEST — CLICK ANY kWh AND RETYPE IT</div>
        <div className="chain-export-actions">
          <button type="button" onClick={exportCsv} className="mono chain-export-button">
            EXPORT CSV
          </button>
          <button type="button" onClick={exportJson} className="mono chain-export-button">
            EXPORT JSON
          </button>
        </div>
      </div>

      {compromised && <div className="chain-void-stamp">INTEGRITY VOID</div>}

      <div data-reveal className="chain-card">
        <div className={`chain-status chain-status-${status.variant}`}>
          <div className="mono chain-status-text">
            <span className="chain-status-dot" />
            {status.text}
          </div>
          {compromised && (
            <button type="button" onClick={restoreChain} className="mono chain-reseal-button">
              RE-SEAL LEDGER
            </button>
          )}
        </div>
        <div className="chain-table-scroll">
          <div className="mono chain-columns">
            <span>TIME</span>
            <span>FROM → TO</span>
            <span className="chain-col-right">kWh</span>
            <span className="chain-col-right">CREDIT</span>
            <span className="chain-col-right">SEAL</span>
          </div>
          {rows.map((block) => (
            <ChainLedgerRow
              key={block.id}
              block={block}
              isEditing={editingBlockId === block.id}
              editValue={editValue}
              onStartEdit={startEdit}
              onEditValueChange={setEditValue}
              onCommitEdit={commitEdit}
              onCancelEdit={cancelEdit}
            />
          ))}
        </div>
      </div>
      <div className="mono chain-footnote">
        EACH SEAL = SHA-256( PREVIOUS SEAL + ENTRY PAYLOAD ). ALTER ONE FIGURE AND EVERY ENTRY DOWNSTREAM FAILS
        VERIFICATION — COMPUTED LIVE IN YOUR BROWSER, NOT FAKED.
      </div>
    </div>
  )
}

export default ChainLedger
