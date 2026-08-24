import { send, type ResourceOptions } from './resource'
import type { DayType } from '../lib/simulation'
import type { LedgerTimeframe } from '../lib/ledgerRange'

/**
 * Storage for the public browser demo.
 *
 * The only endpoints in the API that answer without a session. They are scoped
 * by a session identifier the browser generates and keeps, so a visitor reads
 * back their own simulation and nobody else's; there is no account behind it and
 * nothing here can reach an organisation's real data.
 *
 * What the server stores is not simply what it is told. It recomputes every
 * seal from the trade payload and sums each day's totals from the trades it
 * holds, reporting any disagreement rather than adopting the browser's version.
 * `sealMatchesClient` and `totalsMatchClient` are those verdicts.
 */

export interface DemoTradeInput {
  /** Position within the simulated day; the browser chain restarts each day. */
  blockId: number
  /** Simulated 24-hour clock, `HH:MM`. */
  clock: string
  fromName: string
  toName: string
  kwh: number
  credit: number
  rate: number
  clientSeal: string
  clientPreviousSeal: string
}

export interface RecordDemoTradesInput {
  runId: string
  dayType: DayType
  startHour: number
  simSpeed: number
  simDay: number
  trades: DemoTradeInput[]
}

export interface DemoIngestResult {
  recorded: number
  /** Blocks the store already held; a replayed flush reports these. */
  duplicates: number
  /** Blocks refused because storing them would leave a hole in the chain. */
  rejected: number
  /** Trades whose recomputed seal differed from the one this browser sent. */
  sealMismatches: number
}

export interface DemoHouseholdDayInput {
  householdId: number
  householdName: string
  generatedKwh: number
  consumedKwh: number
  exportedKwh: number
  importedKwh: number
  earnedInr: number
  spentInr: number
  tradeCount: number
  balanceInr: number
}

export interface RecordDemoDayInput {
  runId: string
  simDay: number
  dayType: DayType
  totalKwh: number
  totalCredit: number
  tradeCount: number
  closingRate: number
  compromised: boolean
  invalidCount: number
  households: DemoHouseholdDayInput[]
}

export interface DemoDayResult {
  /** False when this simulated day had already been closed. */
  recorded: boolean
  households: number
  /** False when the reported totals differed from the stored trades. */
  totalsMatchClient: boolean
}

export interface DemoStoredTrade {
  id: string
  runId: string
  simDay: number
  blockId: number
  clock: string
  fromName: string
  toName: string
  kwh: number
  credit: number
  rate: number
  /** Recomputed by the server from the payload, not the seal this browser sent. */
  seal: string
  previousSeal: string
  sealMatchesClient: boolean
  recordedAt: string
}

export interface DemoStoredDay {
  runId: string
  simDay: number
  /** Null while the simulated day is still running. */
  dayType: DayType | null
  totalKwh: number
  totalCredit: number
  tradeCount: number
  closingRate: number | null
  compromised: boolean
  invalidCount: number
  open: boolean
  firstRecordedAt: string
  lastRecordedAt: string
}

export interface DemoLedgerSnapshot {
  timeframe: LedgerTimeframe
  /** Oldest first. */
  trades: DemoStoredTrade[]
  days: DemoStoredDay[]
  totalKwh: number
  totalCredit: number
  /** Trades in the timeframe before any row limit. */
  tradeCount: number
  truncated: boolean
  sealMismatches: number
}

function sessionPath(sessionId: string, suffix: string): string {
  return `/api/v1/demo/sessions/${encodeURIComponent(sessionId)}/${suffix}`
}

export function recordDemoTrades(
  sessionId: string,
  input: RecordDemoTradesInput,
  options: ResourceOptions = {},
): Promise<DemoIngestResult> {
  return send<DemoIngestResult>(options, sessionPath(sessionId, 'trades'), {
    method: 'POST',
    body: input,
  })
}

export function recordDemoDay(
  sessionId: string,
  input: RecordDemoDayInput,
  options: ResourceOptions = {},
): Promise<DemoDayResult> {
  return send<DemoDayResult>(options, sessionPath(sessionId, 'days'), {
    method: 'POST',
    body: input,
  })
}

export function fetchDemoLedger(
  sessionId: string,
  timeframe: LedgerTimeframe,
  options: ResourceOptions = {},
): Promise<DemoLedgerSnapshot> {
  return send<DemoLedgerSnapshot>(options, sessionPath(sessionId, 'ledger'), {
    query: { timeframe },
  })
}
