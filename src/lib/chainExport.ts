import type { ChainBlock } from './hashChain'

const CSV_HEADER = ['id', 'time', 'from', 'to', 'kwh', 'credit', 'hash', 'prevHash']

function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

/** Renders the chain as CSV — one row per block, header first. */
export function chainToCsv(chain: ChainBlock[]): string {
  const rows = chain.map((block) =>
    [
      String(block.id),
      block.payload.t,
      block.payload.from,
      block.payload.to,
      block.payload.kwh.toFixed(2),
      block.payload.credit.toFixed(2),
      block.hash,
      block.prevHash,
    ]
      .map(escapeCsvField)
      .join(','),
  )
  return [CSV_HEADER.join(','), ...rows].join('\n')
}
