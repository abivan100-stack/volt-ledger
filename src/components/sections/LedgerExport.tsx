import { useState } from 'react'
import { useEnergyStore } from '../../store/useEnergyStore'
import { isApiConfigured } from '../../api/config'
import { fetchDemoLedger } from '../../api/demoLedger'
import { ledgerRangeToCsv } from '../../lib/chainExport'
import {
  LEDGER_TIMEFRAMES,
  LEDGER_TIMEFRAME_LABELS,
  buildLiveLedgerRange,
  buildStoredLedgerRange,
  describeLedgerRange,
  type LedgerRange,
  type LedgerTimeframe,
} from '../../lib/ledgerRange'
import { MAX_LEDGER_HISTORY_DAYS } from '../../store/simSlice'
import { demoSessionId } from '../../utils/demoIdentity'
import { downloadTextFile, downloadBlob } from '../../utils/downloadFile'
import './LedgerExport.css'

/**
 * Downloading the ledger over a span of simulated days.
 *
 * Deliberately independent of the day the table above happens to be showing:
 * browsing one day and exporting a month are different intentions, and tying
 * them together would make each worse.
 *
 * A day here means a *simulated* day. The neighbourhood settles one in about
 * three real minutes, so "last 7 days" is seven simulated days, not a week of
 * wall-clock time — counting the latter would put an entire visit inside
 * "today".
 */

const FILE_STEM = 'volt-ledger'

/**
 * Why an export holds what it holds.
 *
 * Kept apart from the range itself because the range only knows *that* it came
 * from memory, not why — and the three reasons call for different words. Telling
 * somebody the store was unreachable when it answered perfectly well and simply
 * had nothing yet would send them looking for a fault that is not there.
 */
type ExportSource = 'stored' | 'no-api' | 'unreachable' | 'empty'

const SOURCE_NOTES: Record<Exclude<ExportSource, 'stored'>, string> = {
  'no-api': 'BUILT FROM THIS SESSION — THIS BUILD HAS NO LEDGER STORE.',
  unreachable: 'BUILT FROM THIS SESSION — THE LEDGER STORE COULD NOT BE REACHED.',
  empty: 'BUILT FROM THIS SESSION — THE LEDGER STORE HAS NOTHING FOR THIS TIMEFRAME YET.',
}

function fileName(timeframe: LedgerTimeframe, extension: string): string {
  return `${FILE_STEM}-${timeframe}.${extension}`
}

function LedgerExport() {
  const [timeframe, setTimeframe] = useState<LedgerTimeframe>('today')
  const [busy, setBusy] = useState<'csv' | 'pdf' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // Selected one at a time: a selector that built an object would hand back a
  // new identity on every store write and re-render this for ever.
  const chain = useEnergyStore((state) => state.chain)
  const ledgerHistory = useEnergyStore((state) => state.ledgerHistory)
  const simDay = useEnergyStore((state) => state.simDay)
  const dayType = useEnergyStore((state) => state.dayType)
  const rate = useEnergyStore((state) => state.rate)
  const totalKwhToday = useEnergyStore((state) => state.totalKwhToday)
  const totalCreditToday = useEnergyStore((state) => state.totalCreditToday)
  const compromised = useEnergyStore((state) => state.compromised)
  const invalidCount = useEnergyStore((state) => state.invalidCount)

  function liveRange(): LedgerRange {
    return buildLiveLedgerRange({
      timeframe,
      history: ledgerHistory,
      current: {
        simDay,
        dayType,
        chain,
        totalKwh: totalKwhToday,
        totalCredit: totalCreditToday,
        rate,
        compromised,
        invalidCount,
      },
    })
  }

  /**
   * Prefers what the ledger store holds, falls back to this tab's memory.
   *
   * The store reaches back past anything the tab still has, so it is the better
   * answer whenever it can be had. When it cannot — no API configured, the
   * server unreachable, persistence switched off — an export built from memory
   * is far better than an error, and the report says which one it is rather
   * than quietly presenting one as the other.
   */
  async function resolveRange(): Promise<{ range: LedgerRange; source: ExportSource }> {
    if (!isApiConfigured()) return { range: liveRange(), source: 'no-api' }

    let source: ExportSource = 'unreachable'
    try {
      const snapshot = await fetchDemoLedger(demoSessionId(), timeframe)
      if (snapshot.tradeCount > 0) {
        return { range: buildStoredLedgerRange(snapshot), source: 'stored' }
      }
      // It answered; it simply has nothing for this timeframe.
      source = 'empty'
    } catch {
      // An unreachable store is not a reason to refuse a download.
    }
    return { range: liveRange(), source }
  }

  function describeSource(range: LedgerRange, source: ExportSource): string | null {
    if (range.entries.length === 0) return 'NOTHING SETTLED IN THIS TIMEFRAME YET.'
    if (source === 'stored') {
      return range.truncated
        ? `READ THE MOST RECENT ${range.entries.length.toLocaleString('en-IN')} OF ${range.tradeCount.toLocaleString('en-IN')} SETTLEMENTS.`
        : null
    }
    return range.truncated
      ? `${SOURCE_NOTES[source]} OLDER THAN ${MAX_LEDGER_HISTORY_DAYS} SIMULATED DAYS IS NOT KEPT IN THE BROWSER.`
      : SOURCE_NOTES[source]
  }

  async function runExport(kind: 'csv' | 'pdf'): Promise<void> {
    if (busy) return
    setBusy(kind)
    setError(null)
    setNotice(null)

    try {
      const { range, source } = await resolveRange()

      if (kind === 'csv') {
        downloadTextFile(fileName(timeframe, 'csv'), ledgerRangeToCsv(range), 'text/csv')
      } else {
        // jsPDF bundles html2canvas + dompurify (~230kB) it does not need for
        // this text-only usage — load it on click, so visitors who never export
        // never pay for it.
        const { buildLedgerPdf } = await import('../../lib/chainPdf')
        const status = describeLedgerRange(range)
        downloadBlob(
          fileName(timeframe, 'pdf'),
          buildLedgerPdf(range, {
            timeframeLabel: LEDGER_TIMEFRAME_LABELS[timeframe],
            statusText: status.text,
            statusVariant: status.variant,
            generatedAt: new Date(),
          }),
        )
      }

      setNotice(describeSource(range, source))
    } catch {
      setError(`${kind.toUpperCase()} EXPORT FAILED. PLEASE TRY AGAIN.`)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="ledger-export">
      <div className="mono ledger-export-label" id="ledger-export-label">
        DOWNLOAD THE LEDGER
      </div>

      <div className="ledger-export-timeframes" role="group" aria-labelledby="ledger-export-label">
        {LEDGER_TIMEFRAMES.map((option) => (
          <button
            key={option}
            type="button"
            className="mono ledger-export-timeframe"
            aria-pressed={timeframe === option}
            onClick={() => {
              setTimeframe(option)
              setNotice(null)
              setError(null)
            }}
          >
            {LEDGER_TIMEFRAME_LABELS[option].toUpperCase()}
          </button>
        ))}
      </div>

      <div className="ledger-export-actions">
        <button
          type="button"
          className="mono ledger-export-button"
          onClick={() => void runExport('csv')}
          disabled={busy !== null}
          aria-busy={busy === 'csv'}
        >
          {busy === 'csv' ? 'PREPARING…' : 'CSV'}
        </button>
        <button
          type="button"
          className="mono ledger-export-button"
          onClick={() => void runExport('pdf')}
          disabled={busy !== null}
          aria-busy={busy === 'pdf'}
        >
          {busy === 'pdf' ? 'GENERATING…' : 'PDF'}
        </button>
      </div>

      {error && (
        <div className="mono ledger-export-message ledger-export-message-error" role="alert">
          {error}
        </div>
      )}
      {!error && notice && (
        <div className="mono ledger-export-message" role="status">
          {notice}
        </div>
      )}
    </div>
  )
}

export default LedgerExport
