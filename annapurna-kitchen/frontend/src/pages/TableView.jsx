import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppData } from '../context/AppDataContext'
import { useToast } from '../context/ToastContext'
import { billingService, orderService, tableService } from '../services/billingService'
import Button from '../components/common/Button'
import Modal from '../components/common/Modal'
import { Badge, ConfirmDialog, PageHeader } from '../components/common/Bits'
import { EmptyState, ErrorState, SkeletonGrid } from '../components/common/States'
import PaymentModal from '../components/billing/PaymentModal'
import { PrintStage } from '../components/billing/PrintTemplates'
import usePrinting from '../components/billing/usePrinting'
import {
  IconCheck,
  IconMerge,
  IconPrint,
  IconRefresh,
  IconSplit,
} from '../components/common/Icons'
import { formatMoney, minutesSince, TABLE_STATUS_LABEL } from '../utils/format'

const STATUS_STYLE = {
  empty: {
    card: 'border-emerald-300 bg-emerald-50 hover:border-emerald-400',
    dot: 'bg-table-empty',
    text: 'text-emerald-900',
    badge: 'success',
  },
  occupied: {
    card: 'border-yellow-300 bg-yellow-50 hover:border-yellow-400',
    dot: 'bg-table-occupied',
    text: 'text-yellow-900',
    badge: 'warning',
  },
  bill_pending: {
    card: 'border-orange-300 bg-orange-50 hover:border-orange-400',
    dot: 'bg-table-pending',
    text: 'text-orange-900',
    badge: 'danger',
  },
}

export default function TableView() {
  const navigate = useNavigate()
  const toast = useToast()
  const { currency, online, reloadAlerts } = useAppData()
  const printing = usePrinting()

  const [tables, setTables] = useState([])
  const [counts, setCounts] = useState({ empty: 0, occupied: 0, bill_pending: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const [detail, setDetail] = useState(null)
  const [mergeMode, setMergeMode] = useState(null) // source order
  const [confirmRelease, setConfirmRelease] = useState(null)
  const [payingBill, setPayingBill] = useState(null)
  const [paying, setPaying] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      const body = await tableService.list({ with_orders: true })
      setTables(body.data || [])
      setCounts(body.counts || {})
    } catch (caught) {
      setError(caught)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const timer = setInterval(load, 25000) // keep the board live
    return () => clearInterval(timer)
  }, [load])

  async function openOrder(table) {
    if (table.status === 'empty') {
      setBusy(true)
      try {
        const result = await tableService.assign(table.id)
        navigate(`/billing/${result.order.id}`)
      } catch (caught) {
        toast.fromError(caught, 'Could not open that table.')
      } finally {
        setBusy(false)
      }
      return
    }
    setDetail(table)
  }

  async function doMerge(target) {
    if (!mergeMode) return
    setBusy(true)
    try {
      const result = await tableService.merge(target.active_order.id, mergeMode.id)
      toast.success(result.message)
      setMergeMode(null)
      setDetail(null)
      load()
    } catch (caught) {
      toast.fromError(caught, 'Could not merge those tables.')
    } finally {
      setBusy(false)
    }
  }

  async function releaseTable(table) {
    setBusy(true)
    try {
      await tableService.release(table.id)
      toast.success(`Table ${table.table_number} is free.`)
      setConfirmRelease(null)
      setDetail(null)
      load()
    } catch (caught) {
      toast.fromError(caught, 'That table still has an unsettled order.')
      setConfirmRelease(null)
    } finally {
      setBusy(false)
    }
  }

  async function settle(payments) {
    if (!payingBill) return
    setPaying(true)
    try {
      const result = await billingService.complete(payingBill.id, payments)
      toast.success(`${result.bill.bill_number} settled.`)
      setPayingBill(null)
      setDetail(null)
      reloadAlerts()
      load()
      await printing.print('receipt', result.receipt, { silent: true })
    } catch (caught) {
      toast.fromError(caught, 'Payment failed. Nothing was saved.')
    } finally {
      setPaying(false)
    }
  }

  async function reprintKot(order) {
    try {
      const payload = await orderService.reprintKot(order.id)
      await printing.print('kot', payload)
    } catch (caught) {
      toast.fromError(caught, 'Could not fetch that KOT.')
    }
  }

  if (error) return <ErrorState error={error} onRetry={load} />

  const legend = [
    { key: 'empty', label: 'Empty', count: counts.empty },
    { key: 'occupied', label: 'Occupied', count: counts.occupied },
    { key: 'bill_pending', label: 'Bill pending', count: counts.bill_pending },
  ]

  return (
    <div>
      <PageHeader
        title="Tables"
        subtitle="Live floor status. Tap a table to open or settle its order."
        actions={
          <Button
            variant="secondary"
            icon={<IconRefresh className="h-4 w-4" />}
            onClick={load}
            disabled={busy}
          >
            Refresh
          </Button>
        }
      />

      {mergeMode && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3">
          <IconMerge className="h-5 w-5 shrink-0 text-brand-700" />
          <p className="min-w-0 flex-1 text-sm text-brand-900">
            Merging <strong>{mergeMode.order_number}</strong> — now tap the table that should
            hold the combined bill.
          </p>
          <Button variant="ghost" size="sm" onClick={() => setMergeMode(null)}>
            Cancel
          </Button>
        </div>
      )}

      <div className="mb-5 flex flex-wrap gap-4">
        {legend.map((entry) => (
          <span key={entry.key} className="flex items-center gap-2 text-[13px] font-semibold text-ink-600">
            <span className={`h-3 w-3 rounded-full ${STATUS_STYLE[entry.key].dot}`} />
            {entry.label}
            <span className="tabular text-ink-400">({entry.count ?? 0})</span>
          </span>
        ))}
      </div>

      {loading ? (
        <SkeletonGrid count={12} />
      ) : tables.length === 0 ? (
        <div className="card">
          <EmptyState
            title="No tables configured"
            description="An administrator can add tables from Settings."
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {tables.map((table) => {
            const style = STATUS_STYLE[table.status]
            const order = table.active_order
            const seated = order ? minutesSince(order.created_at) : null
            const mergeTarget =
              mergeMode && order && order.id !== mergeMode.id && table.status === 'occupied'

            return (
              <button
                key={table.id}
                type="button"
                disabled={busy || (mergeMode && !mergeTarget)}
                onClick={() => (mergeMode ? doMerge(table) : openOrder(table))}
                className={`flex min-h-[140px] flex-col rounded-xl2 border-2 p-3.5 text-left transition disabled:opacity-45 ${
                  style.card
                } ${mergeTarget ? 'ring-2 ring-brand-500 ring-offset-2' : ''}`}
              >
                <div className="flex items-start justify-between">
                  <span className={`font-display text-3xl font-bold leading-none ${style.text}`}>
                    {table.table_number}
                  </span>
                  <span className={`mt-1 h-2.5 w-2.5 rounded-full ${style.dot}`} />
                </div>

                <span className={`mt-1.5 text-[11px] font-bold uppercase tracking-wide ${style.text}`}>
                  {TABLE_STATUS_LABEL[table.status]}
                </span>

                <div className="mt-auto pt-2">
                  {order ? (
                    <>
                      <p className={`tabular text-[15px] font-bold ${style.text}`}>
                        {formatMoney(order.subtotal, currency)}
                      </p>
                      <p className="mt-0.5 text-[12px] text-ink-500">
                        {(order.items || []).length} item
                        {(order.items || []).length === 1 ? '' : 's'}
                        {seated != null && ` · ${seated} min`}
                      </p>
                    </>
                  ) : (
                    <p className="text-[12px] text-ink-500">{table.seats} seats · tap to seat</p>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* ---------------- table detail ---------------- */}
      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail ? `Table ${detail.table_number}` : ''}
        subtitle={detail ? TABLE_STATUS_LABEL[detail.status] : ''}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDetail(null)}>
              Close
            </Button>
            {detail?.active_order && (
              <>
                <Button
                  variant="ghost"
                  icon={<IconMerge className="h-4 w-4" />}
                  onClick={() => {
                    setMergeMode(detail.active_order)
                    setDetail(null)
                  }}
                >
                  Merge into another table
                </Button>
                <Button onClick={() => navigate(`/billing/${detail.active_order.id}`)}>
                  Open in billing
                </Button>
              </>
            )}
          </>
        }
      >
        {detail?.active_order ? (
          <div>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Badge tone="brand">{detail.active_order.order_number}</Badge>
              <Badge tone="neutral">{detail.active_order.created_by_name}</Badge>
              {detail.active_order.kot_sent_at && <Badge tone="success">KOT sent</Badge>}
            </div>

            <ul className="mb-4 divide-y divide-ink-100 rounded-lg border border-ink-200">
              {(detail.active_order.items || []).map((line) => (
                <li key={line.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-ink-900">
                      {line.quantity} × {line.name}
                    </span>
                    {line.bill_id && (
                      <span className="text-[12px] font-semibold text-orange-600">
                        on a generated bill
                      </span>
                    )}
                  </span>
                  <span className="tabular shrink-0 text-sm font-bold text-ink-900">
                    {formatMoney(line.line_total, currency)}
                  </span>
                </li>
              ))}
            </ul>

            <div className="mb-4 flex items-center justify-between rounded-lg bg-ink-50 px-3 py-2.5">
              <span className="text-sm font-semibold text-ink-600">Running subtotal</span>
              <span className="tabular font-display text-lg font-bold text-ink-900">
                {formatMoney(detail.active_order.subtotal, currency)}
              </span>
            </div>

            {/* pending bills on this table (split payments land here) */}
            <PendingBills
              orderId={detail.active_order.id}
              currency={currency}
              onPay={setPayingBill}
              onPrint={(receipt) => printing.print('receipt', receipt)}
            />

            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                icon={<IconPrint className="h-4 w-4" />}
                onClick={() => reprintKot(detail.active_order)}
              >
                Reprint KOT
              </Button>
              <Button
                variant="secondary"
                size="sm"
                icon={<IconSplit className="h-4 w-4" />}
                onClick={() => navigate(`/billing/${detail.active_order.id}`)}
              >
                Split this table
              </Button>
              <Button
                variant="ghost"
                size="sm"
                icon={<IconCheck className="h-4 w-4" />}
                onClick={() => setConfirmRelease(detail)}
              >
                Force release
              </Button>
            </div>
          </div>
        ) : (
          <EmptyState
            title="This table is free"
            description="Open it from the billing screen to seat a new order."
          />
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(confirmRelease)}
        title={`Release table ${confirmRelease?.table_number}?`}
        message="This only works once every bill on the table is fully settled. Unpaid orders are refused."
        confirmLabel="Release"
        loading={busy}
        onConfirm={() => releaseTable(confirmRelease)}
        onCancel={() => setConfirmRelease(null)}
      />

      <PaymentModal
        open={Boolean(payingBill)}
        onClose={() => setPayingBill(null)}
        bill={payingBill}
        currency={currency}
        onConfirm={settle}
        submitting={paying}
        offline={!online}
      />

      <PrintStage kind={printing.staged?.kind} payload={printing.staged?.payload} />
      {printing.dialog}
    </div>
  )
}

/** Bills already generated against an order but not yet paid. */
function PendingBills({ orderId, currency, onPay, onPrint }) {
  const [bills, setBills] = useState([])
  const toast = useToast()

  useEffect(() => {
    let cancelled = false
    billingService
      .bills({ order_id: orderId, status: 'pending', mine: 'false' })
      .then((rows) => {
        if (!cancelled) setBills(rows)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [orderId])

  if (!bills.length) return null

  return (
    <div>
      <p className="section-title mb-2">Awaiting payment</p>
      <ul className="space-y-2">
        {bills.map((bill) => (
          <li
            key={bill.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2.5"
          >
            <span className="min-w-0">
              <span className="block text-sm font-bold text-orange-900">{bill.bill_number}</span>
              <span className="tabular text-[13px] text-orange-800">
                {formatMoney(bill.total, currency)} · {(bill.items || []).length} items
              </span>
            </span>
            <span className="flex gap-1.5">
              <Button
                size="sm"
                variant="ghost"
                icon={<IconPrint className="h-4 w-4" />}
                onClick={async () => {
                  try {
                    onPrint(await billingService.receipt(bill.id))
                  } catch (error) {
                    toast.fromError(error, 'Could not load that receipt.')
                  }
                }}
              >
                Print
              </Button>
              <Button size="sm" variant="saffron" onClick={() => onPay(bill)}>
                Take payment
              </Button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
