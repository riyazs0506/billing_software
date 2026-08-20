import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useAppData } from '../context/AppDataContext'
import { useToast } from '../context/ToastContext'
import customerService from '../services/customerService'
import useDebounce from '../hooks/useDebounce'
import Button from '../components/common/Button'
import Modal from '../components/common/Modal'
import DataTable from '../components/common/DataTable'
import { Input } from '../components/common/Field'
import { Badge, ConfirmDialog, PageHeader } from '../components/common/Bits'
import { EmptyState, ErrorState, Loader } from '../components/common/States'
import { IconPlus, IconSearch, IconTrash, IconUser } from '../components/common/Icons'
import { formatDate, formatDateTime, formatMoney } from '../utils/format'

/** Cashiers get a lookup-and-add view; admins get the full database. */
function CashierView() {
  const toast = useToast()
  const [term, setTerm] = useState('')
  const debounced = useDebounce(term, 250)
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [form, setForm] = useState(null)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (debounced.trim().length < 2) {
      setResults([])
      return undefined
    }
    setSearching(true)
    customerService
      .search(debounced.trim())
      .then((rows) => !cancelled && setResults(rows))
      .catch(() => !cancelled && setResults([]))
      .finally(() => !cancelled && setSearching(false))
    return () => {
      cancelled = true
    }
  }, [debounced])

  async function save() {
    const next = {}
    if (!form.name?.trim()) next.name = 'Enter a name.'
    if (!/^\d{10,15}$/.test((form.phone || '').replace(/\D/g, ''))) {
      next.phone = 'Enter a valid phone number.'
    }
    setErrors(next)
    if (Object.keys(next).length) return

    setSaving(true)
    try {
      const created = await customerService.create({
        name: form.name.trim(),
        phone: form.phone.replace(/\D/g, ''),
      })
      toast.success(`${created.name} saved.`)
      setForm(null)
      setTerm(created.phone)
    } catch (caught) {
      toast.fromError(caught, 'Could not save that customer.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Customers"
        subtitle="Look up a guest by phone or name, or add a new one."
        actions={
          <Button
            icon={<IconPlus className="h-4 w-4" />}
            onClick={() => {
              setErrors({})
              setForm({ name: '', phone: '' })
            }}
          >
            Add customer
          </Button>
        }
      />

      <div className="card p-5">
        <div className="relative">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input
            type="search"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Phone number or name…"
            aria-label="Search customers"
            className="field pl-9"
          />
        </div>

        <div className="mt-4">
          {searching && <Loader label="Searching…" className="py-6" />}
          {!searching && term.trim().length < 2 && (
            <p className="py-8 text-center text-sm text-ink-400">
              Type at least 2 characters to search.
            </p>
          )}
          {!searching && term.trim().length >= 2 && results.length === 0 && (
            <p className="py-8 text-center text-sm text-ink-500">No customer matches “{term}”.</p>
          )}
          <ul className="space-y-1.5">
            {results.map((customer) => (
              <li
                key={customer.id}
                className="flex items-center gap-3 rounded-lg border border-ink-200 px-3 py-2.5"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-100 text-brand-700">
                  <IconUser className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink-900">
                    {customer.name}
                  </span>
                  <span className="tabular block text-[13px] text-ink-500">{customer.phone}</span>
                </span>
                {customer.loyalty_points > 0 && (
                  <Badge tone="saffron">{customer.loyalty_points} pts</Badge>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <Modal
        open={Boolean(form)}
        onClose={() => setForm(null)}
        title="Add customer"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setForm(null)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} loading={saving}>
              Save
            </Button>
          </>
        }
      >
        {form && (
          <div className="space-y-4">
            <Input
              data-autofocus
              label="Name"
              required
              value={form.name}
              error={errors.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
            <Input
              label="Phone"
              required
              inputMode="numeric"
              value={form.phone}
              error={errors.phone}
              onChange={(event) => setForm({ ...form, phone: event.target.value })}
            />
          </div>
        )}
      </Modal>
    </div>
  )
}

function AdminView() {
  const { currency, loyaltyEnabled } = useAppData()
  const toast = useToast()

  const [rows, setRows] = useState([])
  const [meta, setMeta] = useState({ total: 0, page: 1, pages: 1 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const debounced = useDebounce(search, 300)
  const [page, setPage] = useState(1)

  const [form, setForm] = useState(null)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [confirm, setConfirm] = useState(null)
  const [history, setHistory] = useState(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const body = await customerService.list({
        search: debounced || undefined,
        page,
        per_page: 25,
      })
      setRows(body.data)
      setMeta(body.meta)
    } catch (caught) {
      setError(caught)
    } finally {
      setLoading(false)
    }
  }, [debounced, page])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    setPage(1)
  }, [debounced])

  async function save() {
    const next = {}
    if (!form.name?.trim()) next.name = 'Enter a name.'
    if (!/^\d{10,15}$/.test((form.phone || '').replace(/\D/g, ''))) {
      next.phone = 'Enter a valid phone number.'
    }
    setErrors(next)
    if (Object.keys(next).length) return

    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        phone: form.phone.replace(/\D/g, ''),
        note: form.note?.trim() || '',
      }
      if (form.id) await customerService.update(form.id, payload)
      else await customerService.create(payload)
      toast.success('Customer saved.')
      setForm(null)
      load()
    } catch (caught) {
      toast.fromError(caught, 'Could not save that customer.')
    } finally {
      setSaving(false)
    }
  }

  async function remove(customer) {
    setSaving(true)
    try {
      await customerService.remove(customer.id)
      toast.success('Customer deleted.')
      setConfirm(null)
      load()
    } catch (caught) {
      toast.fromError(caught, 'Could not delete that customer.')
      setConfirm(null)
    } finally {
      setSaving(false)
    }
  }

  async function openHistory(customer) {
    setHistory({ customer, bills: null })
    try {
      const body = await customerService.history(customer.id)
      setHistory({ customer: body.customer, bills: body.bills })
    } catch (caught) {
      toast.fromError(caught, 'Could not load that history.')
      setHistory(null)
    }
  }

  if (error) return <ErrorState error={error} onRetry={load} />

  return (
    <div>
      <PageHeader
        title="Customers"
        subtitle="Repeat guests, their spend and their order history."
        actions={
          <Button
            icon={<IconPlus className="h-4 w-4" />}
            onClick={() => {
              setErrors({})
              setForm({ name: '', phone: '', note: '' })
            }}
          >
            Add customer
          </Button>
        }
      />

      <div className="mb-4 relative max-w-md">
        <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search name or phone…"
          aria-label="Search customers"
          className="field pl-9"
        />
      </div>

      <DataTable
        loading={loading}
        rows={rows}
        onRowClick={openHistory}
        columns={[
          {
            key: 'name',
            header: 'Customer',
            render: (row) => (
              <div className="min-w-0">
                <p className="font-semibold text-ink-900">{row.name}</p>
                <p className="tabular text-[13px] text-ink-500">{row.phone}</p>
              </div>
            ),
          },
          {
            key: 'order_count',
            header: 'Visits',
            align: 'center',
            render: (row) => <span className="tabular">{row.order_count ?? 0}</span>,
          },
          {
            key: 'total_spent',
            header: 'Total spent',
            align: 'right',
            render: (row) => (
              <span className="tabular font-bold">{formatMoney(row.total_spent, currency)}</span>
            ),
          },
          {
            key: 'average_spend',
            header: 'Average',
            align: 'right',
            hideBelow: 'md',
            render: (row) => (
              <span className="tabular">{formatMoney(row.average_spend, currency)}</span>
            ),
          },
          {
            key: 'last_visit',
            header: 'Last visit',
            hideBelow: 'lg',
            render: (row) => (
              <span className="text-[13px]">
                {row.last_visit ? formatDate(row.last_visit) : '—'}
              </span>
            ),
          },
          ...(loyaltyEnabled
            ? [
                {
                  key: 'loyalty_points',
                  header: 'Points',
                  align: 'center',
                  render: (row) => <Badge tone="saffron">{row.loyalty_points}</Badge>,
                },
              ]
            : []),
          {
            key: 'actions',
            header: '',
            align: 'right',
            width: '7rem',
            render: (row) => (
              <div className="flex justify-end gap-1">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    setErrors({})
                    setForm({ ...row })
                  }}
                  className="rounded-lg px-2 py-1 text-[13px] font-semibold text-brand-700 hover:bg-brand-50"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    setConfirm(row)
                  }}
                  aria-label={`Delete ${row.name}`}
                  className="rounded-lg p-2 text-ink-500 transition hover:bg-red-50 hover:text-red-600"
                >
                  <IconTrash className="h-4 w-4" />
                </button>
              </div>
            ),
          },
        ]}
        empty={
          <EmptyState
            title={search ? 'No matching customers' : 'No customers yet'}
            description="Customers are usually added at the counter while billing."
          />
        }
      />

      {meta.pages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-[13px] text-ink-500">
            Page {meta.page} of {meta.pages} · {meta.total} customers
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={page >= meta.pages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      <Modal
        open={Boolean(form)}
        onClose={() => setForm(null)}
        title={form?.id ? 'Edit customer' : 'Add customer'}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setForm(null)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} loading={saving}>
              Save
            </Button>
          </>
        }
      >
        {form && (
          <div className="space-y-4">
            <Input
              data-autofocus
              label="Name"
              required
              value={form.name}
              error={errors.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
            <Input
              label="Phone"
              required
              inputMode="numeric"
              value={form.phone}
              error={errors.phone}
              onChange={(event) => setForm({ ...form, phone: event.target.value })}
            />
            <Input
              label="Note"
              value={form.note || ''}
              placeholder="Prefers window seat, allergic to nuts…"
              onChange={(event) => setForm({ ...form, note: event.target.value })}
            />
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(history)}
        onClose={() => setHistory(null)}
        title={history?.customer?.name || ''}
        subtitle={history?.customer?.phone}
        size="lg"
      >
        {!history?.bills ? (
          <Loader />
        ) : history.bills.length === 0 ? (
          <EmptyState title="No visits recorded yet" />
        ) : (
          <>
            <div className="mb-4 grid grid-cols-3 gap-3">
              <div className="rounded-lg bg-ink-100 px-3 py-2.5">
                <p className="text-[12px] font-semibold uppercase text-ink-500">Visits</p>
                <p className="tabular font-display text-lg font-bold">
                  {history.customer.order_count}
                </p>
              </div>
              <div className="rounded-lg bg-ink-100 px-3 py-2.5">
                <p className="text-[12px] font-semibold uppercase text-ink-500">Spent</p>
                <p className="tabular font-display text-lg font-bold">
                  {formatMoney(history.customer.total_spent, currency)}
                </p>
              </div>
              <div className="rounded-lg bg-ink-100 px-3 py-2.5">
                <p className="text-[12px] font-semibold uppercase text-ink-500">Average</p>
                <p className="tabular font-display text-lg font-bold">
                  {formatMoney(history.customer.average_spend, currency)}
                </p>
              </div>
            </div>
            <ul className="divide-y divide-ink-100">
              {history.bills.map((bill) => (
                <li key={bill.id} className="py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink-900">{bill.bill_number}</p>
                      <p className="text-[13px] text-ink-500">
                        {formatDateTime(bill.paid_at)} ·{' '}
                        {bill.order_type === 'dine_in'
                          ? `Table ${bill.table_number || '—'}`
                          : 'Takeaway'}
                      </p>
                    </div>
                    <span className="tabular shrink-0 font-bold">
                      {formatMoney(bill.total, currency)}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-[13px] text-ink-500">
                    {(bill.items || []).map((item) => `${item.quantity}× ${item.name}`).join(', ')}
                  </p>
                </li>
              ))}
            </ul>
          </>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(confirm)}
        title="Delete this customer?"
        message={`"${confirm?.name}" can only be deleted if they have no order history.`}
        confirmLabel="Delete"
        loading={saving}
        onConfirm={() => remove(confirm)}
        onCancel={() => setConfirm(null)}
      />
    </div>
  )
}

export default function Customers() {
  const { isAdmin } = useAuth()
  return isAdmin ? <AdminView /> : <CashierView />
}
