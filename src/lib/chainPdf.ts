import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { ChainBlock } from './hashChain'
import type { ChainStatusVariant } from './chainStatus'
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

type RgbTuple = [number, number, number]

function hexToRgb(hex: string): RgbTuple {
  const value = hex.replace('#', '')
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

/** Renders the chain as a printable report — header, summary stats, status banner, then a paginated table. Returns a PDF Blob; no DOM access. */
export function buildChainPdf(chain: ChainBlock[], meta: ChainPdfMeta): Blob {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
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
  doc.text('Tamper-evident settlement ledger · SHA-256 sealed', MARGIN, 60)

  doc.setFontSize(9)
  doc.text(`Generated ${formatGeneratedAt(meta.generatedAt)}`, pageWidth - MARGIN, 42, { align: 'right' })
  doc.text('Simulated data — nothing real was metered or billed.', pageWidth - MARGIN, 56, { align: 'right' })

  const stats: Array<[string, string]> = [
    ['DAY TYPE', meta.dayTypeLabel],
    ['COMMUNITY RATE', `${formatRupees(meta.rate)}/kWh`],
    ['TOTAL TRADED', `${meta.totalKwh.toFixed(2)} kWh`],
    ['TOTAL SETTLED', formatRupees(meta.totalCredit)],
    ['BLOCKS', String(chain.length)],
  ]
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

  const bannerY = statY + 30
  doc.setDrawColor(...STATUS_COLOR[meta.statusVariant])
  doc.setFillColor(...STATUS_TINT[meta.statusVariant])
  doc.setLineWidth(1.1)
  doc.roundedRect(MARGIN, bannerY, pageWidth - MARGIN * 2, 24, 3, 3, 'FD')
  doc.setFont('courier', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(...STATUS_COLOR[meta.statusVariant])
  doc.text(meta.statusText.toUpperCase(), MARGIN + 10, bannerY + 16)

  autoTable(doc, {
    startY: bannerY + 40,
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
    columnStyles: {
      0: { cellWidth: 26 },
      4: { halign: 'right', cellWidth: 44 },
      5: { halign: 'right', cellWidth: 64 },
      6: { cellWidth: 76 },
    },
  })

  // Page numbers are added in a second pass — autoTable only knows the final
  // page count once every row has been laid out.
  const pageCount = doc.getNumberOfPages()
  const pageHeight = doc.internal.pageSize.getHeight()
  for (let page = 1; page <= pageCount; page++) {
    doc.setPage(page)
    doc.setFont('courier', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...INK_SOFT)
    doc.text(`Volt — Nolambur microgrid, Chennai · Page ${page} of ${pageCount}`, MARGIN, pageHeight - 24)
  }

  return doc.output('blob')
}
