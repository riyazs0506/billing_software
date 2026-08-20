import { useCallback, useEffect, useState } from 'react'
import { useAppData } from '../context/AppDataContext'
import { useToast } from '../context/ToastContext'
import expenseService from '../services/expenseService'
import reportService from '../services/reportService'
import Button from '../components/common/Button'
import Modal from '../components/common/Modal'
import DataTable from '../components/common/DataTable'
import { Input, Select } from '../components/common/Field'
import { Badge, ConfirmDialog, DateRangeBar, PageHeader, StatCard } from '../components/common/Bits'
import { EmptyState, ErrorState } from '../components/common/States'
import { IconDownload, IconExpense, IconPlus, IconTrash } from '../components/common/Icons'
import { daysAgoIso, formatDate, formatMoney, todayIso } from '../utils/format'

export default function Expenses() {
  const { currency } = useAppData()
  const toast = useToast()

  const [start, setStart] = useState(daysAgoIso(29))
  const [end, setEnd] = useState(todayIso())
  const [rows, setRows] = useState([])
  const [meta, setMeta] = useState({ total: 0 })
  const [totalAmount, setTotalAmount] = useState('0.00')
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [form, setForm] = useState(null)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [confirm, setConfirm] = useState(null)
  const [exporting, setExporting] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [body, categoryRows] = await Promise.all([
        expenseService.list({ start_date: start, end_date: end, per_page: 100 }),
        expenseService.categories(),
      ])
      setRows(body.data)
      setMeta(body.meta)
      setTotalAmount(body.total_amount)
      setCategories(categoryRows)
    } catch (caught) {
      setError(caught)
    } finally {
      setLoading(false)
    }
  }, [start, end])

  useEffect(() => {
    load()
  }, [load])

  async function save() {
    const next = {}
    if (!form.description?.trim()) next.description = 'Describe the expense.'
    if (form.amount === '' || Number(form.amount) <= 0) next.amount = 'Enter an amount above zero.'
    if (!form.date) next.date = 'Pick a date.'
    setErrors(next)
    if (Object.keys(next).length) return

    setSaving(true)
    try {
      const payload = {
        description: form.description.trim(),
        category: form.category || '',
        amount: String(form.amount),
        date: form.date,
      }
      if (form.id) await expenseService.update(form.id, payload)
      else await expenseService.create(payload)
      toast.success('Expense saved.')
      setForm(null)
      load()
    } catch (caught) {
      toast.fromError(caught, 'Could not save that expense.')
    } finally {
      setSaving(false)
    }
  }

  async function remove(expense) {
    setSaving(true)
    try {
      await expenseService.remove(expense.id)
      toast.success('Expense deleted.')
      setConfirm(null)
      load()
    } catch (caught) {
      toast.fromError(caught, 'Could not delete that expense.')
    } finally {
      setSaving(false)
    }
  }

  async function exportRows(format) {
    setExporting(true)
    try {
      const filename = await reportService.export('expenses', format, start, end)
      toast.success(`Downloaded ${filename}.`)
    } catch (caught) {
      toast.fromError(caught, 'Export failed.')
    } finally {
      setExporting(false)
    }
  }

  if (error) return <ErrorState error={error} onRetry={load} />

  const dayCount = Math.max(
    1,
    Math.round((new Date(end) - new Date(start)) / 86400000) + 1
  )

  return (
    <div>
      <PageHeader
        title="Expenses"
        subtitle="Everything the restaurant spends. These figures feed the profit and loss report."
        actions={
          <Button
            icon={<IconPlus className="h-4 w-4" />}
            onClick={() => {
              setErrors({})
              setForm({ description: '', category: '', amount: '', date: todayIso() })
            }}
          >
            Add expense
          </Button>
        }
      />

      <DateRangeBar
        start={start}
        end={end}
        onChange={(nextStart, nextEnd) => {
          setStart(nextStart)
          setEnd(nextEnd)
        }}
        presets={[
          { label: 'Today', start_date: todayIso(), end_date: todayIso() },
          { label: 'Last 7 days', start_date: daysAgoIso(6), end_date: todayIso() },
          { label: 'Last 30 days', start_date: daysAgoIso(29), end_date: todayIso() },
        ]}
        right={
          <>
            <Button
              variant="secondary"
              size="sm"
              icon={<IconDownload className="h-4 w-4" />}
              onClick={() => exportRows('csv')}
              loading={exporting}
            >
              CSV
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<IconDownload className="h-4 w-4" />}
              onClick={() => exportRows('xlsx')}
              loading={exporting}
            >
              Excel
            </Button>
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard
          label="Total spent"
          value={formatMoney(totalAmount, currency)}
          hint={`${formatDate(start)} → ${formatDate(end)}`}
          tone="warning"
          loading={loading}
          icon={<IconExpense className="h-4 w-4" />}
        />
        <StatCard
          label="Entries"
          value={meta.total ?? 0}
          tone="neutral"
          loading={loading}
        />
        <StatCard
          label="Daily average"
          value={formatMoney(Number(totalAmount) / dayCount, currency)}
          hint={`Across ${dayCount} day${dayCount === 1 ? '' : 's'}`}
          tone="info"
          loading={loading}
        />
      </div>

      <DataTable
        loading={loading}
        rows={rows}
        columns={[
          {
            key: 'date',
            header: 'Date',
            width: '8rem',
            render: (row) => <span className="text-[13px]">{formatDate(row.date)}</span>,
          },
          {
            key: 'description',
            header: 'Description',
            render: (row) => <span className="font-semibold text-ink-900">{row.description}</span>,
          },
          {
            key: 'category',
            header: 'Category',
            hideBelow: 'sm',
            render: (row) =>
              row.category ? <Badge tone="neutral">{row.category}</Badge> : <span className="text-ink-400">—</span>,
          },
          {
            key: 'created_by_name',
            header: 'Recorded by',
            hideBelow: 'lg',
            render: (row) => <span className="text-[13px] text-ink-500">{row.created_by_name || '—'}</span>,
          },
          {
            key: 'amount',
            header: 'Amount',
            align: 'right',
            render: (row) => (
              <span className="tabular font-bold">{formatMoney(row.amount, currency)}</span>
            ),
          },
          {
            key: 'actions',
            header: '',
            align: 'right',
            width: '7rem',
            render: (row) => (
              <div className="flex justify-end gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setErrors({})
                    setForm({ ...row, amount: String(row.amount) })
                  }}
                  className="rounded-lg px-2 py-1 text-[13px] font-semibold text-brand-700 hover:bg-brand-50"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setConfirm(row)}
                  aria-label="Delete expense"
                  className="rounded-lg p-2 text-ink-500 transition hover:bg-red-50 hover:text-red-600"
                >
                  <IconTrash className="h-4 w-4" />
                </button>
              </div>
            ),
          },
        ]}
        footer={[{ label: 'Total', value: formatMoney(totalAmount, currency) }]}
        empty={
          <EmptyState
            title="No expenses in this range"
            description="Record purchases, gas, rent and wages so the profit and loss report is accurate."
          />
        }
      />

      <Modal
        open={Boolean(form)}
        onClose={() => setForm(null)}
        title={form?.id ? 'Edit expense' : 'Add expense'}
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
              label="Description"
              required
              placeholder="Vegetable purchase — morning market"
              value={form.description}
              error={errors.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Amount"
                required
                type="number"
                step="0.01"
                min="0.01"
                prefix={currency}
                value={form.amount}
                error={errors.amount}
                onChange={(event) => setForm({ ...form, amount: event.target.value })}
              />
              <Input
                label="Date"
                required
                type="date"
                max={todayIso()}
                value={form.date}
                error={errors.date}
                onChange={(event) => setForm({ ...form, date: event.target.value })}
              />
            </div>
            <Select
              label="Category"
              value={form.category || ''}
              onChange={(event) => setForm({ ...form, category: event.target.value })}
            >
              <option value="">Uncategorised</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </Select>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(confirm)}
        title="Delete this expense?"
        message={`"${confirm?.description}" will be removed and the profit and loss figures will change.`}
        confirmLabel="Delete"
        loading={saving}
        onConfirm={() => remove(confirm)}
        onCancel={() => setConfirm(null)}
      />
    </div>
  )
}
