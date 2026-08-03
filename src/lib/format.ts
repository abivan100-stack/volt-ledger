/** Ported verbatim from the original prototype's `money`/`fmtClock` methods. */

export const CURRENCY = {
  symbol: '₹',
  locale: 'en-IN',
} as const

export function formatMoney(amount: number): string {
  const sign = amount < 0 ? '−' : ''
  const magnitude = Math.abs(amount).toLocaleString(CURRENCY.locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `${sign}${CURRENCY.symbol}${magnitude}`
}

export function formatClock(minuteOfDay: number): string {
  const totalMinutes = Math.floor(minuteOfDay)
  const hours = String(Math.floor(totalMinutes / 60) % 24).padStart(2, '0')
  const minutes = String(totalMinutes % 60).padStart(2, '0')
  return `${hours}:${minutes}`
}

export const HASH_PREVIEW_LENGTH = 10

export function shortHash(hash: string, length = HASH_PREVIEW_LENGTH): string {
  return hash.slice(0, length)
}
