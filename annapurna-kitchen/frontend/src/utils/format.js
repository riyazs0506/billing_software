/** Display formatting. All arithmetic happens on the server in Decimal. */

export const CURRENCY_FALLBACK = '₹' // ₹

/** Indian digit grouping: 12,34,567.89 */
export function formatMoney(value, symbol = CURRENCY_FALLBACK) {
  const number = Number(value ?? 0)
  if (Number.isNaN(number)) return `${symbol}0.00`
  const formatted = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(number)
  return `${symbol}${formatted}`
}

export function formatNumber(value, digits = 0) {
  const number = Number(value ?? 0)
  if (Number.isNaN(number)) return '0'
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(number)
}

/** Trims trailing zeros: 20.000 -> 20, 19.250 -> 19.25 */
export function trimDecimals(value) {
  const text = String(value ?? '0')
  if (!text.includes('.')) return text
  return text.replace(/\.?0+$/, '') || '0'
}

export function formatDate(value, options = {}) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...options,
  })
}

export function formatDateTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

export function formatTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

export function relativeTime(value) {
  if (!value) return '—'
  const then = new Date(value).getTime()
  if (Number.isNaN(then)) return '—'
  const seconds = Math.round((Date.now() - then) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} hr ago`
  return formatDate(value)
}

/** Minutes elapsed since a timestamp, for "table seated 25 min". */
export function minutesSince(value) {
  if (!value) return null
  const then = new Date(value).getTime()
  if (Number.isNaN(then)) return null
  return Math.max(0, Math.round((Date.now() - then) / 60000))
}

export const todayIso = () => new Date().toISOString().slice(0, 10)

export function daysAgoIso(days) {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return date.toISOString().slice(0, 10)
}

export function titleCase(value) {
  return String(value ?? '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export const ORDER_TYPE_LABEL = {
  dine_in: 'Dine-in',
  takeaway: 'Takeaway',
}

export const TABLE_STATUS_LABEL = {
  empty: 'Empty',
  occupied: 'Occupied',
  bill_pending: 'Bill pending',
}

export const ORDER_STATUS_LABEL = {
  open: 'Open',
  kot_sent: 'In kitchen',
  billed: 'Billed',
  paid: 'Paid',
  merged: 'Merged',
  cancelled: 'Cancelled',
}

export const PAYMENT_LABEL = { cash: 'Cash', card: 'Card', upi: 'UPI' }

export function initials(name) {
  return String(name || '?')
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}
