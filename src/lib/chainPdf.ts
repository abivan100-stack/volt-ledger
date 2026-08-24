import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { ChainBlock } from './hashChain'
import type { ChainStatusVariant } from './chainStatus'
import type { LedgerRange } from './ledgerRange'
import { shouldSummarisePdf } from './ledgerRange'
import { shortHash } from './format'
import { colors } from '../theme/tokens'

export interface ChainPdfMeta {
  dayTypeLabel: string
  rate: number
  totalKwh: number
  totalCredit: number
  statusText: string
  statusVariant: ChainStatusVariant
  generatedAt: Date
}

export interface LedgerPdfMeta {
  timeframeLabel: string
  statusText: string
  statusVariant: ChainStatusVariant
  generatedAt: Date
}

type RgbTuple = [number, number, number]

function hexToRgb(hex: string): RgbTuple {
  const raw = hex.replace(/^#/, '')
  const value = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw
  if (value.length !== 6 || /[^0-9a-fA-F]/.test(value)) return [0, 0, 0]
  return [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16)]
}

const INK = hexToRgb(colors.ink)
const INK_SOFT = hexToRgb(colors['ink-soft'])
const SETTLE = hexToRgb(colors.settle)
const VOID = hexToRgb(colors.void)
const RULE_2 = hexToRgb(colors['rule-2'])
const PAPER_2 = hexToRgb(colors['paper-2'])
const CARD = hexToRgb(colors.card)
const PAPER = hexToRgb(colors.paper)
const SETTLE_TINT: RgbTuple = [235, 243, 238]
const VOID_TINT: RgbTuple = [252, 235, 233]

// The 14 standard PDF fonts only cover WinAnsiEncoding, which has no glyph
// for "₹" — spell out "Rs" instead rather than embedding a custom font.
function formatRupees(amount: number): string {
  if (!Number.isFinite(amount)) return 'Rs —'
  const sign = amount < 0 ? '-' : ''
  return `${sign}Rs ${Math.abs(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatGeneratedAt(date: Date): string {
  const day = date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  const time = date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
  return `${day} · ${time}`
}

const MARGIN = 40

const STATUS_COLOR: Record<ChainStatusVariant, RgbTuple> = {
  compromised: VOID,
  restored: SETTLE,
  verified: SETTLE,
}

const STATUS_TINT: Record<ChainStatusVariant, RgbTuple> = {
  compromised: VOID_TINT,
  restored: SETTLE_TINT,
  verified: SETTLE_TINT,
}

/** Masthead and generation stamp, identical on every report this module makes. */
function renderHeader(doc: jsPDF, generatedAt: Date, subtitle: string): void {
  const pageWidth = doc.internal.pageSize.getWidth()

  doc.setFillColor(...CARD)
  doc.rect(0, 0, pageWidth, 96, 'F')
  doc.setDrawColor(...RULE_2)
  doc.setLineWidth(1)
  doc.line(0, 96, pageWidth, 96)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.setTextColor(...INK)
  doc.text('VOLT', MARGIN, 42)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(...INK_SOFT)
  doc.text(subtitle, MARGIN, 60)

  doc.setFontSize(9)
  doc.text(`Generated ${formatGeneratedAt(generatedAt)}`, pageWidth - MARGIN, 42, { align: 'right' })
  doc.text('Simulated data — nothing real was metered or billed.', pageWidth - MARGIN, 56, { align: 'right' })
}

/** A row of labelled figures beneath the masthead. Returns the y it ended at. */
function renderStats(doc: jsPDF, stats: Array<[string, string]>): number {
  const pageWidth = doc.internal.pageSize.getWidth()
  const statY = 130
  const statColumnWidth = (pageWidth - MARGIN * 2) / stats.length

  stats.forEach(([label, value], i) => {
    const x = MARGIN + i * statColumnWidth
    doc.setFont('courier', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...INK_SOFT)
    doc.text(label, x, statY)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12.5)
    doc.setTextColor(...INK)
    doc.text(value, x, statY + 18)
  })

  return statY + 30
}

/** The integrity banner. Returns the y the table should start at. */
function renderStatusBanner(
  doc: jsPDF,
  y: number,
  statusText: string,
  variant: ChainStatusVariant,
): number {
  const pageWidth = doc.internal.pageSize.getWidth()

  doc.setDrawColor(...STATUS_COLOR[variant])
  doc.setFillColor(...STATUS_TINT[variant])
  doc.setLineWidth(1.1)
  doc.roundedRect(MARGIN, y, pageWidth - MARGIN * 2, 24, 3, 3, 'FD')
  doc.setFont('courier', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(...STATUS_COLOR[variant])
  doc.text(statusText.toUpperCase(), MARGIN + 10, y + 16)

  return y + 40
}

/**
 * Page numbers, added after the table has been laid out.
 *
 * autoTable only knows the final page count once every row is placed, so this
 * cannot be folded into the header pass.
 */
function renderFooter(doc: jsPDF): void {
  const pageCount = doc.getNumberOfPages()
  const pageHeight = doc.internal.pageSize.getHeight()
  for (let page = 1; page <= pageCount; page++) {
    doc.setPage(page)
    doc.setFont('courier', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...INK_SOFT)
    doc.text(`Volt — Nolambur microgrid, Chennai · Page ${page} of ${pageCount}`, MARGIN, pageHeight - 24)
  }
}

const TABLE_STYLES = {
  styles: {
    font: 'courier',
    fontSize: 8,
    textColor: INK,
    lineColor: RULE_2,
    lineWidth: 0.4,
    cellPadding: 6,
  },
  headStyles: {
    fillColor: INK,
    textColor: PAPER,
    font: 'courier',
    fontStyle: 'bold',
    fontSize: 7.5,
  },
  alternateRowStyles: {
    fillColor: PAPER_2,
  },
} as const

/** Renders the chain as a printable report — header, summary stats, status banner, then a paginated table. Returns a PDF Blob; no DOM access. */
export function buildChainPdf(chain: ChainBlock[], meta: ChainPdfMeta): Blob {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })

  renderHeader(doc, meta.generatedAt, 'Tamper-evident settlement ledger · SHA-256 sealed')
  const afterStats = renderStats(doc, [
    ['DAY TYPE', meta.dayTypeLabel],
    ['COMMUNITY RATE', `${formatRupees(meta.rate)}/kWh`],
    ['TOTAL TRADED', `${meta.totalKwh.toFixed(2)} kWh`],
    ['TOTAL SETTLED', formatRupees(meta.totalCredit)],
    ['BLOCKS', String(chain.length)],
  ])
  const startY = renderStatusBanner(doc, afterStats, meta.statusText, meta.statusVariant)

  autoTable(doc, {
    startY,
    margin: { left: MARGIN, right: MARGIN, bottom: 44 },
    head: [['#', 'TIME', 'FROM', 'TO', 'kWh', 'CREDIT', 'SEAL']],
    body: chain.map((block) => [
      String(block.id),
      block.payload.t,
      block.payload.from,
      block.payload.to,
      block.payload.kwh.toFixed(2),
      formatRupees(block.payload.credit),
      shortHash(block.hash),
    ]),
    ...TABLE_STYLES,
    columnStyles: {
      0: { cellWidth: 26 },
      4: { halign: 'right', cellWidth: 44 },
      5: { halign: 'right', cellWidth: 64 },
      6: { cellWidth: 76 },
    },
  })

  renderFooter(doc)
  return doc.output('blob')
}

/**
 * Renders a whole timeframe as a printable report.
 *
 * Past a few thousand trades the per-trade table stops being a document anybody
 * reads — nobody scrolls nine hundred pages of individual settlements — so the
 * table switches to one row per simulated day. Nothing is lost by it: the CSV
 * carries every row at any size, and the note under the banner says which view
 * this is. Returns a PDF Blob; no DOM access.
 */
export function buildLedgerPdf(range: LedgerRange, meta: LedgerPdfMeta): Blob {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const summarised = shouldSummarisePdf(range)

  renderHeader(doc, meta.generatedAt, 'Tamper-evident settlement ledger · SHA-256 sealed')
  const afterStats = renderStats(doc, [
    ['TIMEFRAME', meta.timeframeLabel],
    ['DAYS', String(range.days.length)],
    ['TOTAL TRADED', `${range.totalKwh.toFixed(2)} kWh`],
    ['TOTAL SETTLED', formatRupees(range.totalCredit)],
    ['SETTLEMENTS', String(range.tradeCount)],
  ])
  let y = renderStatusBanner(doc, afterStats, meta.statusText, meta.statusVariant)

  const notes: string[] = []
  notes.push(
    range.source === 'stored'
      ? 'Rows read back from the Volt ledger store and re-verified against their server-held seals.'
      // Deliberately does not say why. This module cannot tell an unreachable
      // store from one that answered with nothing, and guessing in print would
      // send a reader looking for a fault that may not exist.
      : 'Rows held in this browser session only; the ledger store contributed nothing to this export.',
  )
  if (summarised) {
    notes.push(
      `Summarised to one row per simulated day (${range.entries.length.toLocaleString('en-IN')} settlements). The CSV export carries every row.`,
    )
  }
  if (range.truncated && range.source === 'stored') {
    notes.push(
      `Only the most recent ${range.entries.length.toLocaleString('en-IN')} of ${range.tradeCount.toLocaleString('en-IN')} settlements could be read.`,
    )
  }
  if (range.truncated && range.source === 'live') {
    notes.push('Older simulated days have already been discarded by the browser and are not included.')
  }
  if (range.sealMismatches > 0) {
    notes.push(`${range.sealMismatches} settlement(s) carry a seal the server did not agree with.`)
  }

  doc.setFont('courier', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(...INK_SOFT)
  for (const note of notes) {
    doc.text(note, MARGIN, y)
    y += 11
  }
  y += 8

  if (summarised) {
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN, bottom: 44 },
      head: [['DAY', 'CONDITIONS', 'SETTLEMENTS', 'kWh', 'CREDIT', 'RATE', 'INTEGRITY']],
      body: range.days.map((day) => [
        String(day.simDay),
        day.dayType ?? (day.open ? 'in progress' : '—'),
        String(day.tradeCount),
        day.totalKwh.toFixed(2),
        formatRupees(day.totalCredit),
        day.rate === null ? '—' : `${formatRupees(day.rate)}/kWh`,
        day.compromised ? `VOID (${day.invalidCount})` : 'SEALED',
      ]),
      ...TABLE_STYLES,
      columnStyles: {
        0: { cellWidth: 34 },
        2: { halign: 'right', cellWidth: 74 },
        3: { halign: 'right', cellWidth: 52 },
        4: { halign: 'right', cellWidth: 72 },
        5: { halign: 'right', cellWidth: 76 },
      },
    })
  } else {
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN, bottom: 44 },
      head: [['DAY', '#', 'TIME', 'FROM', 'TO', 'kWh', 'CREDIT', 'SEAL']],
      body: range.entries.map((entry) => [
        String(entry.simDay),
        String(entry.blockId),
        entry.clock,
        entry.from,
        entry.to,
        entry.kwh.toFixed(2),
        formatRupees(entry.credit),
        // A seal the server disagreed with is called out where it is read.
        entry.sealMatchesServer === false ? `${shortHash(entry.seal)} !` : shortHash(entry.seal),
      ]),
      ...TABLE_STYLES,
      columnStyles: {
        0: { cellWidth: 30 },
        1: { cellWidth: 24 },
        5: { halign: 'right', cellWidth: 42 },
        6: { halign: 'right', cellWidth: 62 },
        7: { cellWidth: 80 },
      },
    })
  }

  renderFooter(doc)
  return doc.output('blob')
}
