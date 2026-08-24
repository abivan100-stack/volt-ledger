import type { ChainStatusVariant } from './chainStatus'
import type { ChainBlock } from './hashChain'
import type { DayType } from './simulation'

/**
 * One shape for the ledger over a span of simulated days, however it was
 * obtained.
 *
 * Exports have two possible sources and must not care which they got. When the
 * API is configured, the range comes from what the server stored and can reach
 * back past anything the tab still holds. With no API — the browser-only build,
 * or a server that is simply unreachable — it is assembled from the simulation's
 * own memory instead. Both produce this, so the CSV and PDF writers are written
 * once.
 *
 * A day here means a *simulated* day. The demo completes one in roughly three
 * real minutes at the default speed, so counting back in calendar days would put
 * an entire session inside "today" and leave every other choice empty.
 */

export const LEDGER_TIMEFRAMES = ['today', '7d', '30d', 'all'] as const
export type LedgerTimeframe = (typeof LEDGER_TIMEFRAMES)[number]

export const LEDGER_TIMEFRAME_LABELS: Record<LedgerTimeframe, string> = {
  today: 'Today',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  all: 'All time',
}

/** Simulated days each timeframe covers; null means every day on record. */
export const LEDGER_TIMEFRAME_DAY_SPAN: Record<LedgerTimeframe, number | null> = {
  today: 1,
  '7d': 7,
  '30d': 30,
  all: null,
}

export function isLedgerTimeframe(value: string): value is LedgerTimeframe {
  return (LEDGER_TIMEFRAMES as readonly string[]).includes(value)
}

export interface LedgerEntry {
  /** Null for live rows: a run only gets an identifier once it is stored. */
  runId: string | null
  simDay: number
  blockId: number
  clock: string
  from: string
  to: string
  kwh: number
  credit: number
  seal: string
  previousSeal: string
  /** Null for live rows, which the server has not seen yet. */
  sealMatchesServer: boolean | null
}

export interface LedgerDay {
  runId: string | null
  simDay: number
  /** Null when the day is still open and has no stored rollup. */
  dayType: DayType | null
  totalKwh: number
  totalCredit: number
  tradeCount: number
  rate: number | null
  compromised: boolean
  invalidCount: number
  open: boolean
}

export interface LedgerRange {
  timeframe: LedgerTimeframe
  /** Where the rows came from, which decides what the export may claim. */
  source: 'stored' | 'live'
  entries: LedgerEntry[]
  days: LedgerDay[]
  totalKwh: number
  totalCredit: number
  /** Trades in the timeframe before any row limit; may exceed `entries.length`. */
  tradeCount: number
  truncated: boolean
  sealMismatches: number
}

/** One archived simulated day, as the simulation keeps it in memory. */
export interface LedgerDaySource {
  simDay: number
  dayType: DayType
  chain: ChainBlock[]
  totalKwh: number
  totalCredit: number
  rate: number
  compromised: boolean
  invalidCount: number
}

export interface LiveLedgerInput {
  timeframe: LedgerTimeframe
  /** Closed days, oldest first. */
  history: LedgerDaySource[]
  /** The day still running. Its rollup does not exist yet. */
  current: LedgerDaySource
}

function roundToPaise(value: number): number {
  return Math.round(value * 100) / 100
}

function entriesFrom(day: LedgerDaySource, runId: string | null): LedgerEntry[] {
  return day.chain.map((block) => ({
    runId,
    simDay: day.simDay,
    blockId: block.id,
    clock: block.payload.t,
    from: block.payload.from,
    to: block.payload.to,
    kwh: block.payload.kwh,
    credit: block.payload.credit,
    seal: block.hash,
    previousSeal: block.prevHash,
    sealMatchesServer: null,
  }))
}

/**
 * Builds the range from the simulation's own memory.
 *
 * The reach of this is bounded by what the tab is holding: the store keeps a
 * limited number of archived days and drops the rest, so "all time" here means
 * all of what survived, not all that ever ran. That is the honest answer when
 * nothing is storing the rest, and the caller marks the export accordingly.
 */
export function buildLiveLedgerRange({ timeframe, history, current }: LiveLedgerInput): LedgerRange {
  const ordered = [...history, current]
  const span = LEDGER_TIMEFRAME_DAY_SPAN[timeframe]
  const selected = span === null ? ordered : ordered.slice(-span)

  // Days are numbered from one within a run, so an oldest day of anything but
  // one is proof that earlier ones have been discarded. That is evidence rather
  // than inference: a history sitting exactly at its cap having lost nothing
  // still starts at day one, and must not be reported as partial.
  const discardedOlderDays = (ordered[0]?.simDay ?? 1) > 1
  const wantedMoreDays = span === null || span > ordered.length
  const truncated = wantedMoreDays && discardedOlderDays

  const days: LedgerDay[] = selected.map((day, index) => ({
    runId: null,
    simDay: day.simDay,
    dayType: day.dayType,
    totalKwh: roundToPaise(day.totalKwh),
    totalCredit: roundToPaise(day.totalCredit),
    tradeCount: day.chain.length,
    rate: day.rate,
    compromised: day.compromised,
    invalidCount: day.invalidCount,
    // Only the last of the selected days can be the one still running, and only
    // when the selection actually reaches the end of the record.
    open: index === selected.length - 1 && selected[index] === current,
  }))

  const entries = selected.flatMap((day) => entriesFrom(day, null))

  return {
    timeframe,
    source: 'live',
    entries,
    days,
    totalKwh: roundToPaise(days.reduce((total, day) => total + day.totalKwh, 0)),
    totalCredit: roundToPaise(days.reduce((total, day) => total + day.totalCredit, 0)),
    tradeCount: entries.length,
    truncated,
    sealMismatches: 0,
  }
}

/** The `/demo/sessions/:id/ledger` payload, as the API client returns it. */
export interface StoredLedgerInput {
  timeframe: LedgerTimeframe
  trades: Array<{
    runId: string
    simDay: number
    blockId: number
    clock: string
    fromName: string
    toName: string
    kwh: number
    credit: number
    seal: string
    previousSeal: string
    sealMatchesClient: boolean
  }>
  days: Array<{
    runId: string
    simDay: number
    dayType: DayType | null
    totalKwh: number
    totalCredit: number
    tradeCount: number
    closingRate: number | null
    compromised: boolean
    invalidCount: number
    open: boolean
  }>
  totalKwh: number
  totalCredit: number
  tradeCount: number
  truncated: boolean
  sealMismatches: number
}

/** Maps a stored ledger snapshot onto the shared range shape. */
export function buildStoredLedgerRange(snapshot: StoredLedgerInput): LedgerRange {
  return {
    timeframe: snapshot.timeframe,
    source: 'stored',
    entries: snapshot.trades.map((trade) => ({
      runId: trade.runId,
      simDay: trade.simDay,
      blockId: trade.blockId,
      clock: trade.clock,
      from: trade.fromName,
      to: trade.toName,
      kwh: trade.kwh,
      credit: trade.credit,
      seal: trade.seal,
      previousSeal: trade.previousSeal,
      sealMatchesServer: trade.sealMatchesClient,
    })),
    days: snapshot.days.map((day) => ({
      runId: day.runId,
      simDay: day.simDay,
      dayType: day.dayType,
      totalKwh: day.totalKwh,
      totalCredit: day.totalCredit,
      tradeCount: day.tradeCount,
      rate: day.closingRate,
      compromised: day.compromised,
      invalidCount: day.invalidCount,
      open: day.open,
    })),
    totalKwh: snapshot.totalKwh,
    totalCredit: snapshot.totalCredit,
    tradeCount: snapshot.tradeCount,
    truncated: snapshot.truncated,
    sealMismatches: snapshot.sealMismatches,
  }
}

/**
 * Rows above which a detailed PDF stops being a document anybody reads.
 *
 * Past this the PDF switches to one row per simulated day. Nobody scrolls nine
 * hundred pages of individual trades, and the per-day view is the more useful
 * artefact at that size; the CSV still carries every row for anyone who wants
 * the detail.
 */
export const LEDGER_PDF_DETAIL_LIMIT = 2_000

export function shouldSummarisePdf(range: LedgerRange): boolean {
  // A truncated range summarises whatever its size. The per-day totals are
  // computed over every trade in the timeframe, so the summary stays complete
  // where a per-trade table could only show the rows that fitted — a document
  // that looks like the whole ledger while being part of it.
  return range.truncated || range.entries.length > LEDGER_PDF_DETAIL_LIMIT
}

/**
 * One line describing a whole timeframe's integrity.
 *
 * A range is sound only if nothing in it is questionable, so a single tampered
 * day or a single seal the server disagreed with colours the whole report. Both
 * are counted rather than merely flagged: "one day" and "nine days" call for
 * different reactions.
 */
export function describeLedgerRange(range: LedgerRange): {
  text: string
  variant: ChainStatusVariant
} {
  const compromisedDays = range.days.filter((day) => day.compromised).length
  const settlements = `${range.tradeCount} settlement${range.tradeCount === 1 ? '' : 's'}`
  const days = `${range.days.length} day${range.days.length === 1 ? '' : 's'}`

  if (compromisedDays === 0 && range.sealMismatches === 0) {
    // Everything read verified — but saying only that, over a range known to be
    // missing rows, would let a partial export read as a complete one.
    const text = range.truncated
      ? `Partial ledger · verified over ${settlements} across ${days}`
      : `Chain verified · ${settlements} across ${days}`
    return { text, variant: 'verified' }
  }

  const faults: string[] = []
  if (compromisedDays > 0) faults.push(`${compromisedDays} tampered day${compromisedDays === 1 ? '' : 's'}`)
  if (range.sealMismatches > 0) {
    faults.push(`${range.sealMismatches} seal mismatch${range.sealMismatches === 1 ? '' : 'es'}`)
  }
  return { text: `Integrity void · ${faults.join(' · ')}`, variant: 'compromised' }
}
