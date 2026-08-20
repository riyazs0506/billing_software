import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useAppData } from '../context/AppDataContext'
import { useToast } from '../context/ToastContext'
import { billingService } from '../services/billingService'
import reportService from '../services/reportService'
import useDebounce from '../hooks/useDebounce'
import Button from '../components/common/Button'
import Modal from '../components/common/Modal'
import DataTable from '../components/common/DataTable'
import { Badge, ConfirmDialog, PageHeader, StatCard } from '../components/common/Bits'
import { EmptyState, ErrorState } from '../components/common/States'
import { PrintStage } from '../components/billing/PrintTemplates'
import usePrinting from '../components/billing/usePrinting'
import {
  IconBilling,
  IconCard,
  IconCash,
  IconDownload,
  IconPrint,
  IconRefresh,
  IconSearch,
  IconUpi,
  IconX,
} from '../components/common/Icons'
import {
  formatDateTime,
  formatMoney,
  ORDER_TYPE_LABEL,
  PAYMENT_LABEL,
  todayIso,
} from '../utils/format'

const MODE_ICON = { cash: IconCash, card: IconCard, upi: IconUpi }

const STATUS_TONE = { paid: 'success', pending: 'warning', void: 'neutral' }

/**
 * Bill history for both roles.
 *
 * Admin sees the whole ledger with a date filter and export. A cashier sees
 * the bills raised from their own counter session, so they can find and
 * reprint a receipt without any admin access.
 */
export default function BillHistory() {
  const { isAdmin } = useAuth()
  const { currency } = useAppData()
  const toast = useToast()
  const printing = usePrinting()

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [date, setDate] = useState(todayIso())
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const debounced = useDebounce(search, 300)

  const [detail, setDetail] = useState(null)
  const [receipt, setReceipt] = useState(null)
  const [loadingReceipt, setLoadingReceipt] = useState(false)
  const [voiding, setVoiding] = useState(null)
  const [busy, setBusy] = useState(false)
  const [exporting, setExporting] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      const params = { limit: 200, mine: isAdmin ? 'false' : 'true' }
      if (date) params.date = date
      if (status) params.status = status
      if (debounced.trim()) params.search = debounced.trim()
      setRows(await billingService.bills(params))
    } catch (caught) {
      setError(caught)
    } finally {
      setLoading(false)
    }
  }, [date, status, debounced, isAdmin])

  useEffect(() => {
    load()
  }, [load])

  const totals = useMemo(() => {
    const paid = rows.filter((row) => row.status === 'paid')
    const sum = (list, key) =>
      list.reduce((acc, row) => acc + Number(row[key] || 0), 0)
    const byMode = { cash: 0, card: 0, upi: 0 }
    paid.forEach((bill) => {
      const payments = bill.payments || []
      payments.forEach((payment) => {
        byMode[payment.mode] = (byMode[payment.mode] || 0) + Number(payment.amount || 0)
      })
    })
    return {
      count: paid.length,
      pending: rows.filter((row) => row.status === 'pending').length,
      revenue: sum(paid, 'total'),
      discount: sum(paid, 'discount_applied'),
      byMode,
    }
  }, [rows])

  async function openDetail(bill) {
    setDetail(bill)
    setReceipt(null)
    setLoadingReceipt(true)
    try {
      setReceipt(await billingService.receipt(bill.id))
    } catch (caught) {
      toast.fromError(caught, 'Could not load that receipt.')
    } finally {
      setLoadingReceipt(false)
    }
  }

  async function reprint() {
    if (!receipt) return
    await printing.print('receipt', receipt)
  }

  async function doVoid(bill) {
    setBusy(true)
    try {
      await billingService.voidBill(bill.id)
      toast.success(`${bill.bill_number} voided. Its items can be billed again.`)
      setVoiding(null)
      setDetail(null)
      load()
    } catch (caught) {
      toast.fromError(caught, 'That bill could not be voided.')
      setVoiding(null)
    } finally {
      setBusy(false)
    }
  }

  async function exportLedger(format) {
    setExporting(true)
    try {
      const filename = await reportService.export('bills', format, date, date)
      toast.success(`Downloaded ${filename}.`)
    } catch (caught) {
      toast.fromError(caught, 'Export failed.')
    } finally {
      setExporting(false)
    }
  }

  if (error) return <ErrorState error={error} onRetry={load} />

  const columns = [
    {
      key: 'bill_number',
      header: 'Bill',
      render: (row) => (
        <div className="min-w-0">
          <p className="font-semibold text-ink-900">{row.bill_number}</p>
          <p className="text-[13px] text-ink-500">{row.order_number}</p>
        </div>
      ),
    },
    {
      key: 'created_at',
      header: 'Time',
      hideBelow: 'sm',
      render: (row) => (
        <span className="text-[13px] text-ink-600">
          {formatDateTime(row.paid_at || row.created_at)}
        </span>
      ),
    },
    {
      key: 'order_type',
      header: 'Type',
      hideBelow: 'md',
      render: (row) => (
        <span className="text-[13px]">
          {ORDER_TYPE_LABEL[row.order_type] || row.order_type}
          {row.table_number ? ` · T${row.table_number}` : ''}
        </span>
      ),
    },
    ...(isAdmin
      ? [
          {
            key: 'created_by_name',
            header: 'Cashier',
            hideBelow: 'lg',
            render: (row) => (
              <span className="text-[13px] text-ink-600">{row.created_by_name || '—'}</span>
            ),
          },
        ]
      : []),
    {
      key: 'payments',
      header: 'Paid by',
      align: 'center',
      hideBelow: 'sm',
      render: (row) => {
        const modes = [...new Set((row.payments || []).map((p) => p.mode))]
        if (!modes.length) return <span className="text-ink-400">—</span>
        return (
          <span className="inline-flex items-center gap-1">
            {modes.map((mode) => {
              const Icon = MODE_ICON[mode]
              return (
                <span
                  key={mode}
                  title={PAYMENT_LABEL[mode]}
                  className="grid h-6 w-6 place-items-center rounded-md bg-ink-100 text-ink-600"
                >
                  {Icon ? <Icon className="h-3.5 w-3.5" /> : mode[0].toUpperCase()}
                </span>
              )
            })}
            {modes.length > 1 && (
              <span className="text-[11px] font-bold text-brand-700">split</span>
            )}
          </span>
        )
      },
    },
    {
      key: 'status',
      header: 'Status',
      align: 'center',
      render: (row) => (
        <Badge tone={STATUS_TONE[row.status] || 'neutral'}>{row.status}</Badge>
      ),
    },
    {
      key: 'total',
      header: 'Total',
      align: 'right',
      render: (row) => (
        <span className="tabular font-bold text-ink-900">
          {formatMoney(row.total, currency)}
        </span>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Bill History"
        subtitle={
          isAdmin
            ? 'Every invoice raised at the counter. Open one to view or reprint it.'
            : 'Bills you raised. Open one to reprint the receipt.'
        }
        actions={
          <>
            <Button
              variant="secondary"
              icon={<IconRefresh className="h-4 w-4" />}
              onClick={load}
              disabled={loading}
            >
              Refresh
            </Button>
            {isAdmin && (
              <>
                <Button
                  variant="secondary"
                  icon={<IconDownload className="h-4 w-4" />}
                  onClick={() => exportLedger('csv')}
                  loading={exporting}
                >
                  CSV
                </Button>
                <Button
                  icon={<IconDownload className="h-4 w-4" />}
                  onClick={() => exportLedger('xlsx')}
                  loading={exporting}
                >
                  Excel
                </Button>
              </>
            )}
          </>
        }
      />

      {/* filters */}
      <div className="card mb-5 flex flex-wrap items-end gap-3 p-4">
        <div>
          <label className="label" htmlFor="bh-date">
            Date
          </label>
          <input
            id="bh-date"
            type="date"
            value={date}
            max={todayIso()}
            onChange={(event) => setDate(event.target.value)}
            className="field w-auto"
          />
        </div>
        <div>
          <label className="label" htmlFor="bh-status">
            Status
          </label>
          <select
            id="bh-status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="field w-auto"
          >
            <option value="">All</option>
            <option value="paid">Paid</option>
            <option value="pending">Pending</option>
            <option value="void">Void</option>
          </select>
        </div>
        <div className="min-w-[12rem] flex-1">
          <label className="label" htmlFor="bh-search">
            Search
          </label>
          <div className="relative">
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <input
              id="bh-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Bill number…"
              className="field pl-9"
            />
          </div>
        </div>
        {(date !== todayIso() || status || search) && (
          <Button
            variant="ghost"
            icon={<IconX className="h-4 w-4" />}
            onClick={() => {
              setDate(todayIso())
              setStatus('')
              setSearch('')
            }}
          >
            Clear
          </Button>
        )}
      </div>

      {/* summary */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Paid bills"
          value={totals.count}
          hint={totals.pending ? `${totals.pending} still pending` : 'All settled'}
          tone="brand"
          loading={loading}
          icon={<IconBilling className="h-4 w-4" />}
        />
        <StatCard
          label="Revenue"
          value={formatMoney(totals.revenue, currency)}
          hint={`${formatMoney(totals.discount, currency)} discount given`}
          tone="success"
          loading={loading}
        />
        <StatCard
          label="Average bill"
          value={formatMoney(totals.count ? totals.revenue / totals.count : 0, currency)}
          tone="info"
          loading={loading}
        />
        <StatCard
          label="Cash / Card / UPI"
          value={formatMoney(totals.byMode.cash, currency)}
          hint={`${formatMoney(totals.byMode.card, currency)} · ${formatMoney(
            totals.byMode.upi,
            currency
          )}`}
          tone="saffron"
          loading={loading}
        />
      </div>

      <DataTable
        loading={loading}
        rows={rows}
        columns={columns}
        onRowClick={openDetail}
        empty={
          <EmptyState
            title="No bills for this filter"
            description={
              date === todayIso()
                ? 'Nothing has been billed yet today.'
                : 'Try a different date or clear the filters.'
            }
          />
        }
      />

      {/* ---- detail ---- */}
      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail?.bill_number}
        subtitle={
          detail
            ? `${ORDER_TYPE_LABEL[detail.order_type] || ''}${
                detail.table_number ? ` · Table ${detail.table_number}` : ''
              } · ${formatDateTime(detail.paid_at || detail.created_at)}`
            : ''
        }
        size="lg"
        footer={
          <>
            {isAdmin && detail?.status === 'pending' && (
              <Button variant="danger" onClick={() => setVoiding(detail)}>
                Void bill
              </Button>
            )}
            <Button variant="secondary" onClick={() => setDetail(null)}>
              Close
            </Button>
            <Button
              icon={<IconPrint className="h-4 w-4" />}
              onClick={reprint}
              loading={printing.printing}
              disabled={!receipt || loadingReceipt}
            >
              Reprint receipt
            </Button>
          </>
        }
      >
        {detail && (
          <div>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Badge tone={STATUS_TONE[detail.status] || 'neutral'}>{detail.status}</Badge>
              <Badge tone="neutral">{detail.order_number}</Badge>
              {detail.created_by_name && (
                <Badge tone="neutral">Cashier: {detail.created_by_name}</Badge>
              )}
              {detail.customer_name && (
                <Badge tone="info">
                  {detail.customer_name}
                  {detail.customer_phone ? ` · ${detail.customer_phone}` : ''}
                </Badge>
              )}
            </div>

            <ul className="mb-4 divide-y divide-ink-100 rounded-lg border border-ink-200">
              {(detail.items || []).map((line) => (
                <li key={line.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-ink-900">
                      {line.quantity} × {line.name}
                    </span>
                    <span className="tabular text-[13px] text-ink-500">
                      {formatMoney(line.price_at_order, currency)} each
                    </span>
                  </span>
                  <span className="tabular shrink-0 text-sm font-bold">
                    {formatMoney(line.line_total, currency)}
                  </span>
                </li>
              ))}
            </ul>

            <dl className="rounded-lg bg-ink-50 px-4 py-3">
              {[
                ['Subtotal', detail.subtotal],
                ...(Number(detail.discount_applied) > 0
                  ? [
                      [
                        `Discount (${detail.discount_percentage}%)${
                          detail.discount_label ? ` · ${detail.discount_label}` : ''
                        }`,
                        `− ${formatMoney(detail.discount_applied, currency)}`,
                        true,
                      ],
                    ]
                  : []),
                ['Taxable value', detail.taxable_value],
                [`CGST @ ${detail.cgst_rate}%`, detail.cgst],
                [`SGST @ ${detail.sgst_rate}%`, detail.sgst],
              ].map(([label, value, raw]) => (
                <div key={label} className="flex justify-between gap-3 py-1 text-[13px]">
                  <dt className="text-ink-600">{label}</dt>
                  <dd className="tabular font-semibold text-ink-800">
                    {raw ? value : formatMoney(value, currency)}
                  </dd>
                </div>
              ))}
              <div className="mt-2 flex justify-between gap-3 border-t border-ink-200 pt-2">
                <dt className="font-display font-bold text-ink-900">Total</dt>
                <dd className="tabular font-display text-lg font-bold text-ink-900">
                  {formatMoney(detail.total, currency)}
                </dd>
              </div>
            </dl>

            {(detail.payments || []).length > 0 && (
              <div className="mt-4">
                <p className="section-title mb-2">
                  Payment{detail.payments.length > 1 ? 's (split)' : ''}
                </p>
                <ul className="space-y-1.5">
                  {detail.payments.map((payment) => {
                    const Icon = MODE_ICON[payment.mode]
                    return (
                      <li
                        key={payment.id}
                        className="flex items-center gap-3 rounded-lg border border-ink-200 px-3 py-2"
                      >
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-ink-100 text-ink-600">
                          {Icon ? <Icon className="h-4 w-4" /> : null}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-ink-900">
                            {PAYMENT_LABEL[payment.mode] || payment.mode}
                          </span>
                          {payment.reference && (
                            <span className="block text-[13px] text-ink-500">
                              {payment.reference}
                            </span>
                          )}
                          {payment.change_given && Number(payment.change_given) > 0 && (
                            <span className="block text-[13px] text-ink-500">
                              Tendered {formatMoney(payment.tendered, currency)} · change{' '}
                              {formatMoney(payment.change_given, currency)}
                            </span>
                          )}
                        </span>
                        <span className="tabular shrink-0 font-bold">
                          {formatMoney(payment.amount, currency)}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}

            {detail.status === 'pending' && (
              <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] text-amber-900">
                This bill has not been settled yet. Take payment from the Tables screen.
              </p>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(voiding)}
        title={`Void ${voiding?.bill_number}?`}
        message="The bill is cancelled and its items return to the order so they can be billed again. Paid bills cannot be voided."
        confirmLabel="Void bill"
        loading={busy}
        onConfirm={() => doVoid(voiding)}
        onCancel={() => setVoiding(null)}
      />

      <PrintStage kind={printing.staged?.kind} payload={printing.staged?.payload} />
      {printing.dialog}
    </div>
  )
}
