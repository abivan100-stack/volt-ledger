import type { ChainBlock } from './hashChain'
import type { LedgerRange } from './ledgerRange'

const CSV_HEADER = ['id', 'time', 'from', 'to', 'kwh', 'credit', 'hash', 'prevHash']

/**
 * Columns for a multi-day export.
 *
 * `run` and `sealVerified` are blank on rows the simulation is still holding in
 * memory rather than absent: a run has no identifier until it is stored, and a
 * seal the server has never seen cannot be reported as agreeing or disagreeing
 * with it. Leaving the cells empty says that; omitting the columns for some rows
 * and not others would make the file harder to read, not more truthful.
 */
const RANGE_CSV_HEADER = [
  'day',
  'run',
  'block',
  'time',
  'from',
  'to',
  'kwh',
  'credit',
  'seal',
  'prevSeal',
  'sealVerified',
]

/**
 * Characters a spreadsheet reads as the start of a formula rather than text.
 *
 * Quoting alone does not help: Excel, Sheets and LibreOffice all strip the
 * quotes and then evaluate what is inside.
 */
const FORMULA_LEAD = /^[=+\-@\t\r]/

/** A value that is simply a number, which needs no defending against. */
const PLAIN_NUMBER = /^[-+]?\d+(\.\d+)?$/

/**
 * Stops a cell being executed when the file is opened.
 *
 * Household names reach this from the ledger store, which accepts them from an
 * unauthenticated endpoint, and an exported file is the kind of thing people
 * mail to each other. A leading apostrophe is the conventional defence: every
 * major spreadsheet treats the rest as text and does not display it.
 *
 * Negative numbers are left alone. They begin with a character on the list but
 * are the ordinary content of a credit column, and quoting them as text would
 * break the arithmetic somebody opened the file to do.
 */
function neutraliseFormula(value: string): string {
  if (!FORMULA_LEAD.test(value) || PLAIN_NUMBER.test(value)) return value
  return `'${value}`
}

function escapeCsvField(value: string): string {
  const safe = neutraliseFormula(value)
  if (/[",\n\r]/.test(safe)) return `"${safe.replace(/"/g, '""')}"`
  return safe
}

function toRow(fields: string[]): string {
  return fields.map(escapeCsvField).join(',')
}

/** Renders the chain as CSV — one row per block, header first. */
export function chainToCsv(chain: ChainBlock[]): string {
  const rows = chain.map((block) =>
    toRow([
      String(block.id),
      block.payload.t,
      block.payload.from,
      block.payload.to,
      block.payload.kwh.toFixed(2),
      block.payload.credit.toFixed(2),
      block.hash,
      block.prevHash,
    ]),
  )
  return [CSV_HEADER.join(','), ...rows].join('\n')
}

/**
 * Renders a whole timeframe as CSV — one row per trade, every trade included.
 *
 * Unlike the PDF, this never summarises. A spreadsheet is the one place the full
 * detail is still usable at any size, so it is where the full detail goes.
 */
export function ledgerRangeToCsv(range: LedgerRange): string {
  const rows = range.entries.map((entry) =>
    toRow([
      String(entry.simDay),
      entry.runId ?? '',
      String(entry.blockId),
      entry.clock,
      entry.from,
      entry.to,
      entry.kwh.toFixed(2),
      entry.credit.toFixed(2),
      entry.seal,
      entry.previousSeal,
      entry.sealMatchesServer === null ? '' : String(entry.sealMatchesServer),
    ]),
  )
  return [RANGE_CSV_HEADER.join(','), ...rows].join('\n')
}

/** Renders the per-day totals of a timeframe as CSV. */
export function ledgerDaysToCsv(range: LedgerRange): string {
  const header = ['day', 'run', 'dayType', 'trades', 'kwh', 'credit', 'rate', 'compromised', 'open']
  const rows = range.days.map((day) =>
    toRow([
      String(day.simDay),
      day.runId ?? '',
      day.dayType ?? '',
      String(day.tradeCount),
      day.totalKwh.toFixed(2),
      day.totalCredit.toFixed(2),
      day.rate === null ? '' : day.rate.toFixed(2),
      String(day.compromised),
      String(day.open),
    ]),
  )
  return [header.join(','), ...rows].join('\n')
}
