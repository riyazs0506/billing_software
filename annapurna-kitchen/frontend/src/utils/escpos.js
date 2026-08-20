/**
 * Minimal ESC/POS command builder for 58 mm and 80 mm thermal printers.
 *
 * Produces a Uint8Array of raw printer bytes. The transport (QZ Tray, WebUSB
 * or Web Bluetooth) is chosen separately in services/printerService.js.
 */

const ESC = 0x1b
const GS = 0x1d
const LF = 0x0a

export const COLUMNS = { 58: 32, 80: 48 }

export class EscPosBuilder {
  constructor(paperWidth = 80) {
    this.columns = COLUMNS[String(paperWidth)] || COLUMNS[80]
    this.bytes = []
    this.raw(ESC, 0x40) // initialise
  }

  raw(...values) {
    this.bytes.push(...values)
    return this
  }

  /** CP437-ish encoding: anything outside ASCII degrades to '?'. */
  text(value = '') {
    for (const char of String(value)) {
      const code = char.charCodeAt(0)
      this.bytes.push(code < 128 ? code : 0x3f)
    }
    return this
  }

  line(value = '') {
    return this.text(value).raw(LF)
  }

  feed(count = 1) {
    for (let i = 0; i < count; i += 1) this.bytes.push(LF)
    return this
  }

  align(mode = 'left') {
    const map = { left: 0, center: 1, right: 2 }
    return this.raw(ESC, 0x61, map[mode] ?? 0)
  }

  bold(on = true) {
    return this.raw(ESC, 0x45, on ? 1 : 0)
  }

  underline(on = true) {
    return this.raw(ESC, 0x2d, on ? 1 : 0)
  }

  /** width/height are 1..8 multipliers. */
  size(width = 1, height = 1) {
    const w = Math.min(Math.max(width, 1), 8) - 1
    const h = Math.min(Math.max(height, 1), 8) - 1
    return this.raw(GS, 0x21, (w << 4) | h)
  }

  rule(char = '-') {
    return this.line(char.repeat(this.columns))
  }

  /** Left text and right text on one line, padded apart. */
  columnsPair(left, right) {
    const l = String(left ?? '')
    const r = String(right ?? '')
    const gap = Math.max(this.columns - l.length - r.length, 1)
    if (l.length + r.length >= this.columns) {
      // Too long for one line: wrap the label, keep the number on its own line.
      this.line(l)
      return this.line(r.padStart(this.columns))
    }
    return this.line(l + ' '.repeat(gap) + r)
  }

  /** An item row: name, qty x price, and the line total right-aligned. */
  itemRow(name, quantity, price, lineTotal) {
    const amount = String(lineTotal)
    const label = String(name)
    const maxLabel = this.columns - amount.length - 1
    this.line(
      label.length > maxLabel
        ? label.slice(0, maxLabel)
        : label + ' '.repeat(maxLabel - label.length) + ' ' + amount
    )
    if (label.length > maxLabel) {
      this.line(' '.repeat(this.columns - amount.length) + amount)
    }
    return this.line(`  ${quantity} x ${price}`)
  }

  cut(partial = true) {
    this.feed(4)
    return this.raw(GS, 0x56, partial ? 0x42 : 0x00, 0x00)
  }

  openDrawer() {
    return this.raw(ESC, 0x70, 0x00, 0x19, 0xfa)
  }

  build() {
    return new Uint8Array(this.bytes)
  }

  toBase64() {
    let binary = ''
    for (const byte of this.bytes) binary += String.fromCharCode(byte)
    return btoa(binary)
  }
}

const money = (symbol, value) => `${symbol}${value}`

/** Render a receipt payload (from /api/billing/bills/:id/receipt) to bytes. */
export function buildReceipt(payload, paperWidth = 80) {
  const b = new EscPosBuilder(paperWidth)
  const { business = {}, bill = {}, order = {}, items = [], payments = [] } = payload
  const symbol = business.currency_symbol || 'Rs.'

  b.align('center').bold(true).size(2, 2).line(business.name || 'Restaurant').size(1, 1)
  if (business.tagline) b.line(business.tagline)
  b.bold(false)
  if (business.address) b.line(business.address)
  if (business.phone) b.line(`Ph: ${business.phone}`)
  if (business.gstin) b.line(`GSTIN: ${business.gstin}`)
  if (business.fssai) b.line(`FSSAI: ${business.fssai}`)
  b.rule('=')

  b.align('left')
  b.columnsPair(`Bill: ${bill.bill_number || '-'}`, order.order_number || '')
  b.columnsPair(
    new Date(bill.paid_at || bill.created_at || Date.now()).toLocaleString('en-IN'),
    ''
  )
  const type = order.order_type === 'dine_in' ? 'DINE-IN' : 'TAKEAWAY'
  b.columnsPair(type, order.table_number ? `Table ${order.table_number}` : '')
  if (payload.cashier) b.line(`Cashier: ${payload.cashier}`)
  if (payload.customer) {
    b.line(`Customer: ${payload.customer.name} (${payload.customer.phone})`)
  }
  b.rule()

  b.bold(true).columnsPair('ITEM', 'AMOUNT').bold(false).rule()
  items.forEach((item) => {
    b.itemRow(item.name, item.quantity, money(symbol, item.price), money(symbol, item.line_total))
  })
  b.rule()

  b.columnsPair('Subtotal', money(symbol, bill.subtotal))
  if (Number(bill.discount_applied) > 0) {
    b.columnsPair(
      `Discount (${bill.discount_percentage}%)`,
      `-${money(symbol, bill.discount_applied)}`
    )
  }
  if (Number(bill.cgst) > 0 || Number(bill.sgst) > 0) {
    b.columnsPair('Taxable value', money(symbol, bill.taxable_value))
    b.columnsPair(`CGST @ ${bill.cgst_rate}%`, money(symbol, bill.cgst))
    b.columnsPair(`SGST @ ${bill.sgst_rate}%`, money(symbol, bill.sgst))
  }
  b.rule('=')
  b.bold(true).size(1, 2).columnsPair('TOTAL', money(symbol, bill.total)).size(1, 1).bold(false)
  b.rule('=')

  payments.forEach((payment) => {
    b.columnsPair(
      payment.mode.toUpperCase() + (payment.reference ? ` ${payment.reference}` : ''),
      money(symbol, payment.amount)
    )
  })

  b.feed(1).align('center')
  if (bill.tax_mode === 'inclusive') b.line('(Prices are inclusive of GST)')
  b.line(business.footer || 'Thank you!')
  b.cut()
  return b.build()
}

/** Render a KOT payload (from /api/orders/:id/kot) to bytes. */
export function buildKot(payload, paperWidth = 80) {
  const b = new EscPosBuilder(paperWidth)
  b.align('center').bold(true).size(2, 2)
  b.line(payload.is_reprint ? 'KOT (REPRINT)' : 'KOT').size(1, 1)
  b.line(payload.order_type === 'dine_in' ? 'DINE-IN' : 'TAKEAWAY')
  if (payload.table_number) b.size(2, 2).line(`TABLE ${payload.table_number}`).size(1, 1)
  b.bold(false).rule('=')

  b.align('left')
  b.columnsPair(payload.order_number || '', `#${payload.kot_sequence || 1}`)
  b.line(new Date(payload.printed_at || Date.now()).toLocaleString('en-IN'))
  if (payload.created_by_name) b.line(`By: ${payload.created_by_name}`)
  b.rule()

  b.bold(true).size(1, 2)
  ;(payload.items || []).forEach((item) => {
    b.line(`${item.quantity} x ${item.name}`)
    if (item.note) {
      b.size(1, 1).line(`   >> ${item.note}`).size(1, 2)
    }
  })
  b.size(1, 1).bold(false)
  b.rule('=').cut()
  return b.build()
}

export function buildTest(payload, paperWidth = 80) {
  const b = new EscPosBuilder(paperWidth)
  b.align('center').bold(true).size(2, 2).line('TEST').size(1, 1).bold(false)
  ;(payload.lines || []).forEach((line) => b.line(line))
  b.feed(1).line(new Date().toLocaleString('en-IN')).cut()
  return b.build()
}
