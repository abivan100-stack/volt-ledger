import { useState } from 'react'
import { useEnergyStore } from '../../store/useEnergyStore'
import { chainStatusFor } from '../../lib/chainStatus'
import { chainToCsv } from '../../lib/chainExport'
import { DAY_TYPE_LABELS } from '../../lib/simulation'
import { downloadTextFile, downloadBlob } from '../../utils/downloadFile'
import ChainLedgerRow from './ChainLedgerRow'
import './ChainLedger.css'

function ChainLedger() {
  const [generatingPdf, setGeneratingPdf] = useState(false)
  const [pdfError, setPdfError] = useState<string | null>(null)
  const [selectedDay, setSelectedDay] = useState<number | 'current'>('current')
  const chain = useEnergyStore((state) => state.chain)
  const ledgerHistory = useEnergyStore((state) => state.ledgerHistory)
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
  const dayType = useEnergyStore((state) => state.dayType)
  const rate = useEnergyStore((state) => state.rate)
  const totalKwhToday = useEnergyStore((state) => state.totalKwhToday)
  const totalCreditToday = useEnergyStore((state) => state.totalCreditToday)
  const simDay = useEnergyStore((state) => state.simDay)

  const archive = selectedDay === 'current' ? undefined : ledgerHistory.find((entry) => entry.simDay === selectedDay)
  const isCurrent = !archive
  const viewedChain = archive?.chain ?? chain
  const viewedDayType = archive?.dayType ?? dayType
  const viewedRate = archive?.rate ?? rate
  const viewedTotalKwh = archive?.totalKwh ?? totalKwhToday
  const viewedTotalCredit = archive?.totalCredit ?? totalCreditToday
  const viewedCompromised = archive?.compromised ?? compromised
  const viewedInvalidCount = archive?.invalidCount ?? invalidCount

  const rows = viewedChain.slice(-10).reverse()

  const status = chainStatusFor({
    compromised: viewedCompromised,
    restoredFlash: isCurrent && restoredFlash,
    invalidCount: viewedInvalidCount,
    chainLength: viewedChain.length,
    headHash: viewedChain.length ? viewedChain[viewedChain.length - 1].hash : null,
  })

  const exportCsv = () => downloadTextFile(`volt-ledger-day-${archive?.simDay ?? simDay}.csv`, chainToCsv(viewedChain), 'text/csv')
  const exportPdf = async () => {
    if (generatingPdf) return
    setGeneratingPdf(true)
    setPdfError(null)
    try {
      // jsPDF bundles html2canvas + dompurify (~230kB) it doesn't need for
      // this text/table-only usage — load it on click, not with the route,
      // so visitors who never export never pay for it.
      const { buildChainPdf } = await import('../../lib/chainPdf')
      const blob = buildChainPdf(viewedChain, {
        dayTypeLabel: DAY_TYPE_LABELS[viewedDayType],
        rate: viewedRate,
        totalKwh: viewedTotalKwh,
        totalCredit: viewedTotalCredit,
        statusText: status.text,
        statusVariant: status.variant,
        generatedAt: new Date(),
      })
      downloadBlob(`volt-ledger-day-${archive?.simDay ?? simDay}.pdf`, blob)
    } catch {
      setPdfError('PDF EXPORT FAILED. PLEASE TRY AGAIN.')
    } finally {
      setGeneratingPdf(false)
    }
  }

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
          <button
            type="button"
            onClick={exportPdf}
            disabled={generatingPdf}
            aria-busy={generatingPdf}
            className="mono chain-export-button"
          >
            {generatingPdf ? 'GENERATING…' : 'EXPORT PDF'}
          </button>
        </div>
        <div className="chain-day-selector" role="group" aria-label="Ledger day">
          {ledgerHistory.map((entry) => (
            <button
              key={entry.simDay}
              type="button"
              className="mono chain-day-button"
              aria-pressed={selectedDay === entry.simDay}
              onClick={() => setSelectedDay(entry.simDay)}
            >
              DAY {String(entry.simDay).padStart(2, '0')}
            </button>
          ))}
          <button
            type="button"
            className="mono chain-day-button"
            aria-pressed={isCurrent}
            onClick={() => setSelectedDay('current')}
          >
            DAY {String(simDay).padStart(2, '0')} LIVE
          </button>
        </div>
      </div>

      {pdfError && <div className="mono chain-export-error" role="alert">{pdfError}</div>}

      {viewedCompromised && <div className="chain-void-stamp">INTEGRITY VOID</div>}

      <div data-reveal className="chain-card">
        <div className={`chain-status chain-status-${status.variant}`}>
          <div className="mono chain-status-text">
            <span className="chain-status-dot" />
            {status.text}
          </div>
          {isCurrent && compromised && (
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
              editable={isCurrent}
              isEditing={isCurrent && editingBlockId === block.id}
              editValue={editValue}
              onStartEdit={startEdit}
              onEditValueChange={setEditValue}
              onCommitEdit={commitEdit}
              onCancelEdit={cancelEdit}
            />
          ))}
          {rows.length === 0 && (
            <div className="mono chain-empty-state">NO SETTLEMENTS YET · THE NEXT ELIGIBLE TRADE WILL APPEAR HERE</div>
          )}
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
