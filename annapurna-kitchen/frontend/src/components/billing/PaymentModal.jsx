import { useEffect, useMemo, useState } from 'react'
import Modal from '../common/Modal'
import Button from '../common/Button'
import { Input } from '../common/Field'
import { Badge } from '../common/Bits'
import { IconCard, IconCash, IconPlus, IconTrash, IconUpi } from '../common/Icons'
import { formatMoney } from '../../utils/format'

const MODES = [
  { value: 'cash', label: 'Cash', Icon: IconCash },
  { value: 'card', label: 'Card', Icon: IconCard },
  { value: 'upi', label: 'UPI', Icon: IconUpi },
]

/** Round money to 2dp without float drift showing up in the input. */
const money = (value) => Math.round((Number(value) || 0) * 100) / 100
const toFixed = (value) => money(value).toFixed(2)

export default function PaymentModal({
  open,
  onClose,
  bill,
  currency = '₹',
  onConfirm,
  submitting = false,
  offline = false,
}) {
  const total = money(bill?.total)
  const alreadyPaid = money(bill?.amount_paid)
  const due = money(total - alreadyPaid)

  const [tenders, setTenders] = useState([])
  const [tendered, setTendered] = useState('')
  const [error, setError] = useState(null)

  // Reset to a single full-amount cash tender each time the modal opens.
  useEffect(() => {
    if (!open) return
    setTenders([{ id: 1, mode: 'cash', amount: toFixed(due), reference: '' }])
    setTendered('')
    setError(null)
  }, [open, due])

  const entered = useMemo(
    () => money(tenders.reduce((sum, tender) => sum + (Number(tender.amount) || 0), 0)),
    [tenders]
  )
  const balance = money(due - entered)
  const settles = Math.abs(balance) < 0.005

  const cashTender = tenders.find((tender) => tender.mode === 'cash')
  const change = useMemo(() => {
    if (!cashTender || !tendered) return null
    const diff = money(Number(tendered) - Number(cashTender.amount || 0))
    return diff >= 0 ? diff : null
  }, [cashTender, tendered])

  function updateTender(id, patch) {
    setError(null)
    setTenders((current) =>
      current.map((tender) => (tender.id === id ? { ...tender, ...patch } : tender))
    )
  }

  function addTender() {
    setError(null)
    const used = tenders.map((tender) => tender.mode)
    const nextMode = MODES.find((mode) => !used.includes(mode.value))?.value || 'cash'
    setTenders((current) => [
      ...current,
      {
        id: Date.now(),
        mode: nextMode,
        amount: balance > 0 ? toFixed(balance) : '',
        reference: '',
      },
    ])
  }

  function removeTender(id) {
    setError(null)
    setTenders((current) => current.filter((tender) => tender.id !== id))
  }

  /** Split the remaining balance evenly across the current tenders. */
  function splitEvenly() {
    if (!tenders.length) return
    const each = money(due / tenders.length)
    setTenders((current) =>
      current.map((tender, index) => ({
        ...tender,
        amount:
          index === current.length - 1
            ? toFixed(due - each * (current.length - 1))
            : toFixed(each),
      }))
    )
  }

  function submit() {
    if (!settles) {
      setError(
        balance > 0
          ? `Still short by ${formatMoney(balance, currency)}. A bill is not marked paid until it is settled in full.`
          : `Entered ${formatMoney(-balance, currency)} more than the bill total. Record the exact amount and put the rest in "cash received".`
      )
      return
    }
    const payload = tenders
      .filter((tender) => Number(tender.amount) > 0)
      .map((tender) => ({
        mode: tender.mode,
        amount: toFixed(tender.amount),
        reference: tender.reference?.trim() || undefined,
        ...(tender.mode === 'cash' && tendered ? { tendered: toFixed(tendered) } : {}),
      }))

    if (!payload.length) {
      setError('Enter at least one payment amount.')
      return
    }
    onConfirm(payload)
  }

  const quickCash = [50, 100, 200, 500, 2000]

  return (
    <Modal
      open={open}
      onClose={submitting ? undefined : onClose}
      title="Take payment"
      subtitle={bill ? `${bill.bill_number} · ${formatMoney(total, currency)}` : ''}
      size="lg"
      closeOnBackdrop={!submitting}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant={settles ? 'success' : 'primary'}
            size="lg"
            onClick={submit}
            loading={submitting}
            disabled={!settles && !submitting}
            data-autofocus
          >
            {offline ? 'Queue payment offline' : `Complete · ${formatMoney(total, currency)}`}
          </Button>
        </>
      }
    >
      {/* amount summary */}
      <div className="mb-5 grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-ink-100 px-3.5 py-3">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-500">Bill</p>
          <p className="tabular mt-1 font-display text-xl font-bold text-ink-900">
            {formatMoney(total, currency)}
          </p>
        </div>
        <div className="rounded-xl bg-ink-100 px-3.5 py-3">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-500">Entered</p>
          <p className="tabular mt-1 font-display text-xl font-bold text-ink-900">
            {formatMoney(entered, currency)}
          </p>
        </div>
        <div
          className={`rounded-xl px-3.5 py-3 ${
            settles ? 'bg-emerald-50' : balance > 0 ? 'bg-amber-50' : 'bg-red-50'
          }`}
        >
          <p
            className={`text-[12px] font-semibold uppercase tracking-wide ${
              settles ? 'text-emerald-700' : balance > 0 ? 'text-amber-700' : 'text-red-600'
            }`}
          >
            {settles ? 'Settled' : balance > 0 ? 'Balance' : 'Excess'}
          </p>
          <p
            className={`tabular mt-1 font-display text-xl font-bold ${
              settles ? 'text-emerald-800' : balance > 0 ? 'text-amber-800' : 'text-red-700'
            }`}
          >
            {formatMoney(Math.abs(balance), currency)}
          </p>
        </div>
      </div>

      {alreadyPaid > 0 && (
        <p className="mb-4 rounded-lg bg-sky-50 px-3 py-2 text-[13px] text-sky-800">
          {formatMoney(alreadyPaid, currency)} was already tendered on this bill.
        </p>
      )}

      {/* tenders */}
      <div className="space-y-3">
        {tenders.map((tender, index) => (
          <div key={tender.id} className="rounded-xl border border-ink-200 p-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex gap-1.5">
                {MODES.map(({ value, label, Icon }) => {
                  const active = tender.mode === value
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => updateTender(tender.id, { mode: value, reference: '' })}
                      className={`tap flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-bold transition ${
                        active
                          ? 'bg-brand-700 text-white shadow-sm'
                          : 'bg-ink-100 text-ink-600 hover:bg-ink-200'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {label}
                    </button>
                  )
                })}
              </div>
              {tenders.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeTender(tender.id)}
                  aria-label={`Remove tender ${index + 1}`}
                  className="rounded-lg p-2 text-ink-400 transition hover:bg-red-50 hover:text-red-600"
                >
                  <IconTrash className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="Amount"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                prefix={currency}
                value={tender.amount}
                onChange={(event) => updateTender(tender.id, { amount: event.target.value })}
              />
              {tender.mode !== 'cash' && (
                <Input
                  label={tender.mode === 'upi' ? 'UPI reference' : 'Card last 4 / approval'}
                  value={tender.reference}
                  placeholder="Optional"
                  onChange={(event) => updateTender(tender.id, { reference: event.target.value })}
                />
              )}
              {tender.mode === 'cash' && (
                <Input
                  label="Cash received (for change)"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  prefix={currency}
                  value={tendered}
                  placeholder="Optional"
                  onChange={(event) => setTendered(event.target.value)}
                  hint={
                    change != null ? `Change to return: ${formatMoney(change, currency)}` : undefined
                  }
                />
              )}
            </div>

            {tender.mode === 'cash' && (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {quickCash.map((note) => (
                  <button
                    key={note}
                    type="button"
                    onClick={() => setTendered(String(note))}
                    className="rounded-lg bg-ink-100 px-2.5 py-1.5 text-[13px] font-bold text-ink-700 transition hover:bg-saffron-200"
                  >
                    {currency}
                    {note}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setTendered(toFixed(tender.amount))}
                  className="rounded-lg bg-ink-100 px-2.5 py-1.5 text-[13px] font-bold text-ink-700 transition hover:bg-saffron-200"
                >
                  Exact
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {tenders.length < MODES.length && (
          <Button
            variant="secondary"
            size="sm"
            icon={<IconPlus className="h-4 w-4" />}
            onClick={addTender}
          >
            Split payment
          </Button>
        )}
        {tenders.length > 1 && (
          <Button variant="ghost" size="sm" onClick={splitEvenly}>
            Split evenly
          </Button>
        )}
        {balance > 0 && tenders.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              updateTender(tenders[tenders.length - 1].id, {
                amount: toFixed(
                  Number(tenders[tenders.length - 1].amount || 0) + balance
                ),
              })
            }
          >
            Put balance on last tender
          </Button>
        )}
      </div>

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-[13px] font-medium text-red-800"
        >
          {error}
        </p>
      )}

      {offline && (
        <p className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] text-amber-900">
          <Badge tone="warning">Offline</Badge>
          This sale will be stored on this device and synced automatically when the connection
          returns. It cannot be duplicated on sync.
        </p>
      )}
    </Modal>
  )
}
