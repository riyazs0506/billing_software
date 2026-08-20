import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAppData } from '../context/AppDataContext'
import { useToast } from '../context/ToastContext'
import menuService from '../services/menuService'
import { billingService, orderService, tableService } from '../services/billingService'
import { newClientUid } from '../services/offlineQueue'
import useHotkeys from '../hooks/useHotkeys'

import MenuGrid from '../components/billing/MenuGrid'
import OrderPanel from '../components/billing/OrderPanel'
import TotalsBar from '../components/billing/TotalsBar'
import PaymentModal from '../components/billing/PaymentModal'
import CustomerPicker from '../components/billing/CustomerPicker'
import SplitBillModal from '../components/billing/SplitBillModal'
import { PrintStage } from '../components/billing/PrintTemplates'
import usePrinting from '../components/billing/usePrinting'
import { LowStockBanner } from '../components/layout/AppShell'

import Button from '../components/common/Button'
import Modal from '../components/common/Modal'
import { Badge, SegmentedControl } from '../components/common/Bits'
import { Loader } from '../components/common/States'
import {
  IconCheck,
  IconPrint,
  IconTables,
  IconUser,
  IconX,
} from '../components/common/Icons'
import { formatMoney, TABLE_STATUS_LABEL } from '../utils/format'

const EMPTY_TOTALS = {
  subtotal: '0.00',
  discount_applied: '0.00',
  discount_percentage: '0.00',
  taxable_value: '0.00',
  cgst_rate: '0.00',
  sgst_rate: '0.00',
  cgst: '0.00',
  sgst: '0.00',
  total: '0.00',
  tax_mode: 'exclusive',
}

/** Table picker shown when starting a dine-in order. */
function TablePicker({ open, onClose, tables, onPick, loading }) {
  const colours = {
    empty: 'border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100',
    occupied: 'border-yellow-300 bg-yellow-50 text-yellow-900 hover:bg-yellow-100',
    bill_pending: 'border-orange-300 bg-orange-50 text-orange-900 hover:bg-orange-100',
  }
  return (
    <Modal open={open} onClose={onClose} title="Choose a table" size="lg">
      {loading ? (
        <Loader />
      ) : (
        <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-5">
          {tables.map((table) => (
            <button
              key={table.id}
              type="button"
              onClick={() => onPick(table)}
              aria-label={`Table ${table.table_number}, ${
                TABLE_STATUS_LABEL[table.status]
              }, ${table.seats} seats`}
              className={`tap flex min-h-[84px] flex-col items-center justify-center rounded-xl border-2 p-2 font-bold transition ${
                colours[table.status]
              }`}
            >
              <span className="font-display text-2xl leading-none">{table.table_number}</span>
              <span className="mt-1.5 text-[11px] font-semibold uppercase tracking-wide">
                {TABLE_STATUS_LABEL[table.status]}
              </span>
              <span className="text-[11px] opacity-70">{table.seats} seats</span>
            </button>
          ))}
        </div>
      )}
    </Modal>
  )
}

export default function BillingScreen() {
  const navigate = useNavigate()
  const params = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const toast = useToast()
  const {
    currency,
    online,
    autoPrintKot,
    autoPrintReceipt,
    reloadAlerts,
    refreshQueueCount,
  } = useAppData()
  const printing = usePrinting()

  // --- data -------------------------------------------------------------
  const [grid, setGrid] = useState({ categories: [] })
  const [gridLoading, setGridLoading] = useState(true)
  const [tables, setTables] = useState([])
  const [tablesLoading, setTablesLoading] = useState(false)

  // --- current order ----------------------------------------------------
  const [orderType, setOrderType] = useState('dine_in')
  const [order, setOrder] = useState(null)
  const [totals, setTotals] = useState(EMPTY_TOTALS)
  const [discount, setDiscount] = useState(null)
  const [customer, setCustomer] = useState(null)
  const [bill, setBill] = useState(null)

  // --- ui ---------------------------------------------------------------
  const [busy, setBusy] = useState(false)
  const [calculating, setCalculating] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [sendingKot, setSendingKot] = useState(false)
  const [paying, setPaying] = useState(false)
  const [tablePickerOpen, setTablePickerOpen] = useState(false)
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false)
  const [splitOpen, setSplitOpen] = useState(false)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [successBill, setSuccessBill] = useState(null)
  const clientUid = useRef(newClientUid())

  const routeOrderId = params.orderId || searchParams.get('order')

  // --- loaders ----------------------------------------------------------
  const loadGrid = useCallback(async () => {
    setGridLoading(true)
    try {
      setGrid(await menuService.grid())
    } catch (error) {
      toast.fromError(error, 'Could not load the menu.')
    } finally {
      setGridLoading(false)
    }
  }, [toast])

  const loadTables = useCallback(async () => {
    setTablesLoading(true)
    try {
      const body = await tableService.list({ with_orders: false })
      setTables(body.data || [])
    } catch (error) {
      toast.fromError(error, 'Could not load tables.')
    } finally {
      setTablesLoading(false)
    }
  }, [toast])

  useEffect(() => {
    loadGrid()
    loadTables()
  }, [loadGrid, loadTables])

  // Open an existing order when routed here from the table board.
  useEffect(() => {
    if (!routeOrderId) return
    let cancelled = false
    ;(async () => {
      try {
        const existing = await orderService.get(Number(routeOrderId))
        if (cancelled) return
        setOrder(existing)
        setOrderType(existing.order_type)
        if (existing.customer_id) {
          setCustomer({
            id: existing.customer_id,
            name: existing.customer_name,
            phone: existing.customer_phone,
          })
        }
        const pending = (existing.bills || []).find((row) => row.status === 'pending')
        if (pending) setBill(pending)
      } catch (error) {
        toast.fromError(error, 'That order could not be opened.')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [routeOrderId, toast])

  // --- totals recalculation --------------------------------------------
  const recalculate = useCallback(
    async (target) => {
      const current = target || order
      if (!current || !(current.items || []).some((line) => !line.bill_id)) {
        setTotals(EMPTY_TOTALS)
        setDiscount(null)
        return
      }
      setCalculating(true)
      try {
        const preview = await billingService.calculate(current.id)
        setTotals(preview.totals)
        setDiscount(preview.discount)
      } catch (error) {
        if (!error.isOffline) toast.fromError(error, 'Could not calculate the bill.')
      } finally {
        setCalculating(false)
      }
    },
    [order, toast]
  )

  useEffect(() => {
    recalculate(order)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id, order?.items?.length, JSON.stringify((order?.items || []).map((i) => i.quantity))])

  // --- order operations -------------------------------------------------
  const ensureOrder = useCallback(
    async (tableId) => {
      if (order) return order
      const created = await orderService.create({
        order_type: orderType,
        table_id: orderType === 'dine_in' ? tableId : undefined,
        customer_id: customer?.id,
        client_uid: `${clientUid.current}-order`,
      })
      setOrder(created)
      loadTables()
      return created
    },
    [order, orderType, customer, loadTables]
  )

  async function addItem(item) {
    if (orderType === 'dine_in' && !order) {
      setTablePickerOpen(true)
      // remember the pick so the item lands after the table is chosen
      pendingItem.current = item
      return
    }
    setBusy(true)
    try {
      const target = await ensureOrder()
      const result = await orderService.addItem(target.id, {
        menu_item_id: item.id,
        quantity: 1,
      })
      setOrder(result.order)
    } catch (error) {
      toast.fromError(error, `Could not add ${item.name}.`)
    } finally {
      setBusy(false)
    }
  }

  const pendingItem = useRef(null)

  async function pickTable(table) {
    setTablePickerOpen(false)
    setBusy(true)
    try {
      const result = await tableService.assign(table.id, { customer_id: customer?.id })
      setOrder(result.order)
      setOrderType('dine_in')
      loadTables()

      if (pendingItem.current) {
        const item = pendingItem.current
        pendingItem.current = null
        const added = await orderService.addItem(result.order.id, {
          menu_item_id: item.id,
          quantity: 1,
        })
        setOrder(added.order)
      }
    } catch (error) {
      toast.fromError(error, 'Could not open that table.')
    } finally {
      setBusy(false)
    }
  }

  async function changeQuantity(line, delta) {
    if (!order) return
    setBusy(true)
    try {
      const next = line.quantity + delta
      const updated = await orderService.updateItem(order.id, line.id, Math.max(next, 0))
      setOrder(updated)
    } catch (error) {
      toast.fromError(error, 'Could not update that line.')
    } finally {
      setBusy(false)
    }
  }

  async function removeLine(line) {
    if (!order) return
    setBusy(true)
    try {
      setOrder(await orderService.removeItem(order.id, line.id))
    } catch (error) {
      toast.fromError(error, 'Could not remove that line.')
    } finally {
      setBusy(false)
    }
  }

  async function sendKot() {
    if (!order) return
    setSendingKot(true)
    try {
      const result = await orderService.sendKot(order.id)
      setOrder(result.order)
      toast.success('Sent to the kitchen.')
      if (autoPrintKot) await printing.print('kot', result.kot, { silent: true })
    } catch (error) {
      if (error.code === 'nothing_to_send') {
        toast.info('Everything on this order is already in the kitchen.')
      } else {
        toast.fromError(error, 'Could not send the KOT.')
      }
    } finally {
      setSendingKot(false)
    }
  }

  async function generateBill() {
    if (!order) return
    setGenerating(true)
    try {
      const result = await billingService.generate(order.id, { customer_id: customer?.id })
      setBill(result.bill)
      setOrder(result.order)
      setPaymentOpen(true)
      loadTables()
    } catch (error) {
      toast.fromError(error, 'Could not generate the bill.')
    } finally {
      setGenerating(false)
    }
  }

  async function completePayment(payments) {
    if (!bill) return
    setPaying(true)
    try {
      const result = await billingService.completeResilient(bill.id, payments, {
        client_uid: clientUid.current,
        order_type: order?.order_type,
        table_id: order?.table_id,
        customer_id: customer?.id,
        items: (order?.items || [])
          .filter((line) => line.bill_id === bill.id || !line.bill_id)
          .map((line) => ({ menu_item_id: line.menu_item_id, quantity: line.quantity })),
      })

      setPaymentOpen(false)

      if (result.queued) {
        await refreshQueueCount()
        toast.warning(
          'No connection — this sale is queued on this device and will sync automatically.',
          { title: 'Saved offline' }
        )
        resetCounter()
        return
      }

      setSuccessBill(result)
      toast.success(`${result.bill.bill_number} settled.`)
      reloadAlerts()
      loadTables()
      loadGrid()

      if (autoPrintReceipt) await printing.print('receipt', result.receipt, { silent: true })
    } catch (error) {
      toast.fromError(error, 'Payment could not be completed. Nothing was saved.')
    } finally {
      setPaying(false)
    }
  }

  async function doSplit(groups) {
    if (!order) return
    setBusy(true)
    try {
      const result = await tableService.split(order.id, groups)
      setOrder(result.order)
      setSplitOpen(false)
      toast.success(`${result.bills.length} bills created. Settle each one from Tables.`)
      loadTables()
      navigate('/tables')
    } catch (error) {
      toast.fromError(error, 'Could not split this order.')
    } finally {
      setBusy(false)
    }
  }

  function resetCounter() {
    setOrder(null)
    setBill(null)
    setCustomer(null)
    setTotals(EMPTY_TOTALS)
    setDiscount(null)
    setSuccessBill(null)
    clientUid.current = newClientUid()
    if (routeOrderId) {
      setSearchParams({})
      navigate('/billing', { replace: true })
    }
  }

  // --- keyboard shortcuts ----------------------------------------------
  const hotkeys = useMemo(
    () => ({
      f2: () => {
        if (order && (order.items || []).some((line) => !line.kot_sent)) sendKot()
      },
      f4: () => {
        if (order && (order.items || []).some((line) => !line.bill_id) && !bill) generateBill()
      },
      escape: () => {
        if (!paymentOpen && !splitOpen && !customerPickerOpen && !tablePickerOpen && order) {
          resetCounter()
        }
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [order, bill, paymentOpen, splitOpen, customerPickerOpen, tablePickerOpen]
  )
  useHotkeys(hotkeys)

  // --- derived ----------------------------------------------------------
  const unbilled = (order?.items || []).filter((line) => !line.bill_id)
  const canGenerate = Boolean(order) && unbilled.length > 0 && !bill
  const canSendKot = Boolean(order) && (order.items || []).some((line) => !line.kot_sent)
  const canSplit = Boolean(order) && unbilled.length > 1 && !bill

  return (
    // dvh (not vh) so mobile/tablet browser chrome cannot clip the bottom bar,
    // and the banner is shrink-0 so it never steals the grid's height. On a
    // short viewport the page simply scrolls instead of clipping.
    <div className="flex h-[calc(100dvh-7rem)] min-h-[30rem] flex-col">
      <LowStockBanner className="mb-3 shrink-0" />

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[1fr_23rem] xl:grid-cols-[1fr_25rem]">
        {/* ---------------- left: menu ---------------- */}
        <section className="card flex min-h-0 flex-col p-4" aria-label="Menu">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <SegmentedControl
              size="lg"
              value={orderType}
              onChange={(value) => {
                if (order) {
                  toast.info('Finish or clear the current order before switching type.')
                  return
                }
                setOrderType(value)
              }}
              options={[
                { value: 'dine_in', label: 'Dine-in' },
                { value: 'takeaway', label: 'Takeaway' },
              ]}
            />

            {orderType === 'dine_in' && (
              <Button
                variant={order?.table_number ? 'secondary' : 'outline'}
                size="lg"
                icon={<IconTables className="h-[18px] w-[18px]" />}
                onClick={() => setTablePickerOpen(true)}
                disabled={Boolean(order)}
              >
                {order?.table_number ? `Table ${order.table_number}` : 'Select table'}
              </Button>
            )}

            <Button
              variant="secondary"
              size="lg"
              icon={<IconUser className="h-[18px] w-[18px]" />}
              onClick={() => setCustomerPickerOpen(true)}
              className="ml-auto"
            >
              {customer ? customer.name : 'Customer'}
            </Button>
          </div>

          <div className="min-h-0 flex-1">
            <MenuGrid
              categories={grid.categories}
              loading={gridLoading}
              currency={currency}
              onPick={addItem}
              disabled={busy || Boolean(bill)}
            />
          </div>
        </section>

        {/* ---------------- right: order ---------------- */}
        <section
          className="card flex min-h-0 flex-col overflow-hidden"
          aria-label="Current order"
        >
          <header className="flex items-center justify-between gap-2 border-b border-ink-100 px-4 py-3">
            <div className="min-w-0">
              <h2 className="font-display text-[15px] font-bold text-ink-900">
                {order ? order.order_number : 'New order'}
              </h2>
              <p className="truncate text-[13px] text-ink-500">
                {order ? (
                  <>
                    {order.order_type === 'dine_in'
                      ? `Table ${order.table_number}`
                      : 'Takeaway'}
                    {customer ? ` · ${customer.name}` : ''}
                  </>
                ) : (
                  'Tap dishes to begin'
                )}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              {!online && <Badge tone="warning">Offline</Badge>}
              {order && (
                <button
                  type="button"
                  onClick={resetCounter}
                  className="rounded-lg p-2 text-ink-400 transition hover:bg-red-50 hover:text-red-600"
                  aria-label="Clear this order"
                  title="Clear (Esc)"
                >
                  <IconX className="h-4 w-4" />
                </button>
              )}
            </div>
          </header>

          <div className="min-h-0 flex-1">
            <OrderPanel
              order={order}
              currency={currency}
              onIncrement={(line) => changeQuantity(line, 1)}
              onDecrement={(line) => changeQuantity(line, -1)}
              onRemove={removeLine}
              busy={busy}
              locked={Boolean(bill)}
            />
          </div>

          <TotalsBar
            totals={totals}
            discount={discount}
            currency={currency}
            calculating={calculating}
            onGenerate={generateBill}
            onSendKot={sendKot}
            onSplit={() => setSplitOpen(true)}
            generating={generating}
            sendingKot={sendingKot}
            canGenerate={canGenerate}
            canSendKot={canSendKot}
            canSplit={canSplit}
          />

          {bill && !successBill && (
            <div className="border-t border-ink-200 bg-amber-50 px-4 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-semibold text-amber-900">
                  {bill.bill_number} awaiting payment
                </span>
                <Button size="sm" variant="saffron" onClick={() => setPaymentOpen(true)}>
                  Take payment
                </Button>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* ---------------- modals ---------------- */}
      <TablePicker
        open={tablePickerOpen}
        onClose={() => {
          setTablePickerOpen(false)
          pendingItem.current = null
        }}
        tables={tables}
        loading={tablesLoading}
        onPick={pickTable}
      />

      <CustomerPicker
        open={customerPickerOpen}
        onClose={() => setCustomerPickerOpen(false)}
        selected={customer}
        onSelect={async (picked) => {
          setCustomer(picked)
          if (order) {
            try {
              setOrder(await orderService.update(order.id, { customer_id: picked?.id || null }))
            } catch {
              /* attaching a customer is best-effort */
            }
          }
        }}
      />

      <SplitBillModal
        open={splitOpen}
        onClose={() => setSplitOpen(false)}
        order={order}
        currency={currency}
        onSplit={doSplit}
        busy={busy}
      />

      <PaymentModal
        open={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        bill={bill}
        currency={currency}
        onConfirm={completePayment}
        submitting={paying}
        offline={!online}
      />

      {/* success sheet */}
      <Modal
        open={Boolean(successBill)}
        onClose={resetCounter}
        title=""
        hideClose
        size="sm"
        footer={
          <>
            <Button
              variant="secondary"
              icon={<IconPrint className="h-4 w-4" />}
              onClick={() => printing.print('receipt', successBill.receipt)}
              loading={printing.printing}
            >
              Reprint receipt
            </Button>
            <Button size="lg" onClick={resetCounter} data-autofocus>
              Next order
            </Button>
          </>
        }
      >
        <div className="py-2 text-center">
          <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-emerald-100 text-emerald-700">
            <IconCheck className="h-7 w-7" />
          </span>
          <h2 className="font-display text-xl font-bold text-ink-900">Payment received</h2>
          <p className="tabular mt-1 font-display text-3xl font-bold text-brand-800">
            {formatMoney(successBill?.bill?.total, currency)}
          </p>
          <p className="mt-1 text-sm text-ink-500">{successBill?.bill?.bill_number}</p>

          {successBill?.deductions?.length > 0 && (
            <div className="mt-4 rounded-lg bg-ink-50 px-3 py-2.5 text-left">
              <p className="mb-1 text-[12px] font-bold uppercase tracking-wide text-ink-500">
                Stock deducted
              </p>
              <ul className="space-y-0.5">
                {successBill.deductions.map((entry) => (
                  <li key={entry.raw_material_id} className="text-[13px] text-ink-700">
                    {entry.raw_material_name}: −{entry.consumed} {entry.unit}
                    <span className="text-ink-400"> (now {entry.stock_after})</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Modal>

      {/* print staging + retry dialog */}
      <PrintStage kind={printing.staged?.kind} payload={printing.staged?.payload} />
      {printing.dialog}
    </div>
  )
}
