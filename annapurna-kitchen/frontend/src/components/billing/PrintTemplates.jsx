import { createPortal } from 'react-dom'
import { formatDateTime } from '../../utils/format'

/**
 * Browser-print templates. These render into #print-root, which the print
 * stylesheet promotes to the only visible element on the page.
 *
 * The ESC/POS path (utils/escpos.js) produces the same document as raw bytes.
 */

const Row = ({ left, right, bold = false, muted = false }) => (
  <div
    style={{
      display: 'flex',
      justifyContent: 'space-between',
      gap: 8,
      fontWeight: bold ? 700 : 400,
      color: muted ? '#333' : '#000',
    }}
  >
    <span>{left}</span>
    <span>{right}</span>
  </div>
)

const Rule = ({ char = '-' }) => (
  <div style={{ overflow: 'hidden', whiteSpace: 'nowrap', letterSpacing: 0 }}>
    {char.repeat(64)}
  </div>
)

export function ReceiptTemplate({ payload }) {
  if (!payload) return null
  const { business = {}, bill = {}, order = {}, items = [], payments = [] } = payload
  const symbol = business.currency_symbol || 'Rs.'
  const amount = (value) => `${symbol}${value}`

  return (
    <div style={{ fontFamily: 'JetBrains Mono, Consolas, monospace', fontSize: 11, lineHeight: 1.45 }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: 0.5 }}>{business.name}</div>
        {business.tagline && <div>{business.tagline}</div>}
        {business.address && <div>{business.address}</div>}
        {business.phone && <div>Ph: {business.phone}</div>}
        {business.gstin && <div>GSTIN: {business.gstin}</div>}
        {business.fssai && <div>FSSAI: {business.fssai}</div>}
      </div>

      <Rule char="=" />
      <div style={{ textAlign: 'center', fontWeight: 700, letterSpacing: 1 }}>TAX INVOICE</div>
      <Rule char="=" />

      <Row left={`Bill: ${bill.bill_number || '-'}`} right={order.order_number || ''} />
      <Row left={formatDateTime(bill.paid_at || bill.created_at)} right="" />
      <Row
        left={order.order_type === 'dine_in' ? 'DINE-IN' : 'TAKEAWAY'}
        right={order.table_number ? `Table ${order.table_number}` : ''}
      />
      {payload.cashier && <Row left={`Cashier: ${payload.cashier}`} right="" />}
      {payload.customer && (
        <Row left={`Customer: ${payload.customer.name}`} right={payload.customer.phone} />
      )}

      <Rule />
      <Row left="ITEM" right="AMOUNT" bold />
      <Rule />

      {items.map((item, index) => (
        <div key={index} style={{ marginBottom: 2 }}>
          <Row left={item.name} right={amount(item.line_total)} />
          <div style={{ paddingLeft: 10, color: '#333' }}>
            {item.quantity} x {amount(item.price)}
          </div>
        </div>
      ))}

      <Rule />
      <Row left="Subtotal" right={amount(bill.subtotal)} />
      {Number(bill.discount_applied) > 0 && (
        <Row
          left={`Discount (${bill.discount_percentage}%)${
            bill.discount_label ? ` · ${bill.discount_label}` : ''
          }`}
          right={`-${amount(bill.discount_applied)}`}
        />
      )}
      {(Number(bill.cgst) > 0 || Number(bill.sgst) > 0) && (
        <>
          <Row left="Taxable value" right={amount(bill.taxable_value)} muted />
          <Row left={`CGST @ ${bill.cgst_rate}%`} right={amount(bill.cgst)} />
          <Row left={`SGST @ ${bill.sgst_rate}%`} right={amount(bill.sgst)} />
        </>
      )}
      <Rule char="=" />
      <div style={{ fontSize: 14 }}>
        <Row left="TOTAL" right={amount(bill.total)} bold />
      </div>
      <Rule char="=" />

      {payments.map((payment, index) => (
        <Row
          key={index}
          left={`${payment.mode.toUpperCase()}${payment.reference ? ` ${payment.reference}` : ''}`}
          right={amount(payment.amount)}
        />
      ))}

      <div style={{ marginTop: 8, textAlign: 'center' }}>
        {bill.tax_mode === 'inclusive' && <div>(Prices are inclusive of GST)</div>}
        <div style={{ marginTop: 4 }}>{business.footer || 'Thank you!'}</div>
      </div>
    </div>
  )
}

export function KotTemplate({ payload }) {
  if (!payload) return null
  return (
    <div style={{ fontFamily: 'JetBrains Mono, Consolas, monospace', fontSize: 12, lineHeight: 1.5 }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: 2 }}>
          {payload.is_reprint ? 'KOT (REPRINT)' : 'KOT'}
        </div>
        <div style={{ fontWeight: 700 }}>
          {payload.order_type === 'dine_in' ? 'DINE-IN' : 'TAKEAWAY'}
        </div>
        {payload.table_number && (
          <div style={{ fontSize: 20, fontWeight: 700 }}>TABLE {payload.table_number}</div>
        )}
      </div>
      <Rule char="=" />
      <Row left={payload.order_number} right={`#${payload.kot_sequence || 1}`} />
      <Row left={formatDateTime(payload.printed_at)} right="" />
      {payload.created_by_name && <Row left={`By: ${payload.created_by_name}`} right="" />}
      <Rule />
      {(payload.items || []).map((item, index) => (
        <div key={index} style={{ marginBottom: 5 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>
            {item.quantity} x {item.name}
          </div>
          {item.note && <div style={{ paddingLeft: 12 }}>&gt;&gt; {item.note}</div>}
        </div>
      ))}
      <Rule char="=" />
    </div>
  )
}

/** Mounts a template into the print staging area. */
export function PrintStage({ kind, payload }) {
  const root = typeof document !== 'undefined' ? document.getElementById('print-root') : null
  if (!root || !payload) return null
  return createPortal(
    kind === 'kot' ? <KotTemplate payload={payload} /> : <ReceiptTemplate payload={payload} />,
    root
  )
}

export default PrintStage
