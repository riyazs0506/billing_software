import { useCallback, useEffect, useState } from 'react'
import { useAppData } from '../context/AppDataContext'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import settingsService from '../services/settingsService'
import { tableService } from '../services/billingService'
import authService from '../services/authService'
import printerService from '../services/printerService'
import Button from '../components/common/Button'
import Modal from '../components/common/Modal'
import DataTable from '../components/common/DataTable'
import { Input, Select, Textarea, Toggle } from '../components/common/Field'
import { Badge, ConfirmDialog, PageHeader, Tabs } from '../components/common/Bits'
import { EmptyState, ErrorState, Loader } from '../components/common/States'
import { IconPlus, IconPrint, IconTrash } from '../components/common/Icons'
import { formatDateTime } from '../utils/format'

const TABS = [
  { value: 'business', label: 'Business' },
  { value: 'tax', label: 'Tax' },
  { value: 'printer', label: 'Printer' },
  { value: 'tables', label: 'Tables' },
  { value: 'account', label: 'My account' },
]

export default function Settings() {
  const { reloadSettings } = useAppData()
  const toast = useToast()

  const [tab, setTab] = useState('business')
  const [flat, setFlat] = useState({})
  const [draft, setDraft] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      const body = await settingsService.all()
      setFlat(body.flat)
      setDraft(body.flat)
    } catch (caught) {
      setError(caught)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const dirty = Object.keys(draft).some((key) => draft[key] !== flat[key])
  const set = (key, value) => setDraft((current) => ({ ...current, [key]: value }))

  async function save() {
    const changed = Object.fromEntries(
      Object.entries(draft).filter(([key, value]) => value !== flat[key])
    )
    if (!Object.keys(changed).length) return

    setSaving(true)
    try {
      const body = await settingsService.update(changed)
      setFlat(body.flat)
      setDraft(body.flat)
      reloadSettings()
      toast.success('Settings saved.')
    } catch (caught) {
      toast.fromError(caught, 'Could not save these settings.')
    } finally {
      setSaving(false)
    }
  }

  if (error) return <ErrorState error={error} onRetry={load} />
  if (loading) return <Loader label="Loading settings…" />

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Business details, tax configuration, printers and floor layout."
        actions={
          tab !== 'tables' &&
          tab !== 'account' && (
            <>
              {dirty && (
                <Button variant="ghost" onClick={() => setDraft(flat)} disabled={saving}>
                  Discard
                </Button>
              )}
              <Button onClick={save} loading={saving} disabled={!dirty}>
                {dirty ? 'Save changes' : 'Saved'}
              </Button>
            </>
          )
        }
      />

      <Tabs className="mb-5" active={tab} onChange={setTab} tabs={TABS} />

      {tab === 'business' && <BusinessTab draft={draft} set={set} />}
      {tab === 'tax' && <TaxTab draft={draft} set={set} />}
      {tab === 'printer' && <PrinterTab draft={draft} set={set} />}
      {tab === 'tables' && <TablesTab />}
      {tab === 'account' && <AccountTab />}
    </div>
  )
}

/* ------------------------------------------------------------- business */

function BusinessTab({ draft, set }) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="card p-5">
        <h2 className="mb-4 font-display text-[15px] font-bold text-ink-900">
          Restaurant details
        </h2>
        <div className="space-y-4">
          <Input
            label="Restaurant name"
            value={draft['business.name'] || ''}
            onChange={(event) => set('business.name', event.target.value)}
          />
          <Input
            label="Tagline"
            value={draft['business.tagline'] || ''}
            onChange={(event) => set('business.tagline', event.target.value)}
          />
          <Textarea
            label="Address"
            value={draft['business.address'] || ''}
            onChange={(event) => set('business.address', event.target.value)}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Phone"
              value={draft['business.phone'] || ''}
              onChange={(event) => set('business.phone', event.target.value)}
            />
            <Input
              label="Email"
              type="email"
              value={draft['business.email'] || ''}
              onChange={(event) => set('business.email', event.target.value)}
            />
          </div>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="mb-4 font-display text-[15px] font-bold text-ink-900">
          Invoice identity
        </h2>
        <div className="space-y-4">
          <Input
            label="GSTIN"
            value={draft['business.gstin'] || ''}
            hint="15 characters. Printed on every tax invoice."
            onChange={(event) => set('business.gstin', event.target.value.toUpperCase())}
          />
          <Input
            label="FSSAI licence"
            value={draft['business.fssai'] || ''}
            onChange={(event) => set('business.fssai', event.target.value)}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Invoice prefix"
              value={draft['business.invoice_prefix'] || ''}
              hint="Bills are numbered PREFIX-YYYYMMDD-0001."
              onChange={(event) => set('business.invoice_prefix', event.target.value.toUpperCase())}
            />
            <Input
              label="Currency symbol"
              value={draft['business.currency_symbol'] || ''}
              onChange={(event) => set('business.currency_symbol', event.target.value)}
            />
          </div>
          <Textarea
            label="Receipt footer"
            value={draft['business.receipt_footer'] || ''}
            onChange={(event) => set('business.receipt_footer', event.target.value)}
          />
        </div>
      </section>
    </div>
  )
}

/* ------------------------------------------------------------------ tax */

function TaxTab({ draft, set }) {
  const rate = Number(draft['tax.gst_rate'] || 0)
  const half = (rate / 2).toFixed(2)
  const enabled = draft['tax.enabled'] !== 'false'

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="card p-5">
        <h2 className="mb-4 font-display text-[15px] font-bold text-ink-900">GST</h2>
        <div className="space-y-4">
          <Toggle
            checked={enabled}
            onChange={(value) => set('tax.enabled', value ? 'true' : 'false')}
            label="Charge GST on bills"
            description="Switch off only if the outlet is not GST-registered."
          />
          <Input
            label="Total GST rate"
            type="number"
            step="0.01"
            min="0"
            max="100"
            suffix="%"
            disabled={!enabled}
            value={draft['tax.gst_rate'] || ''}
            hint={`Split on the invoice as CGST ${half}% + SGST ${half}%.`}
            onChange={(event) => set('tax.gst_rate', event.target.value)}
          />
          <Select
            label="Pricing mode"
            disabled={!enabled}
            value={draft['tax.mode'] || 'exclusive'}
            onChange={(event) => set('tax.mode', event.target.value)}
            options={[
              { value: 'exclusive', label: 'Tax-exclusive — GST added to the menu price' },
              { value: 'inclusive', label: 'Tax-inclusive — menu price already contains GST' },
            ]}
          />
        </div>
      </section>

      <section className="card p-5">
        <h2 className="mb-1 font-display text-[15px] font-bold text-ink-900">
          Worked example
        </h2>
        <p className="mb-4 text-[13px] text-ink-500">
          A ₹400 order with no discount, using the settings on the left.
        </p>
        <TaxPreview rate={enabled ? rate : 0} mode={draft['tax.mode'] || 'exclusive'} />
      </section>
    </div>
  )
}

function TaxPreview({ rate, mode }) {
  const base = 400
  const half = rate / 2
  let taxable
  let total
  if (!rate) {
    taxable = base
    total = base
  } else if (mode === 'inclusive') {
    taxable = base / (1 + rate / 100)
    total = base
  } else {
    taxable = base
    total = base + (base * rate) / 100
  }
  const cgst = (taxable * half) / 100
  const sgst = cgst
  const fmt = (value) => `₹${value.toFixed(2)}`

  const rows = [
    ['Subtotal', fmt(base)],
    ['Taxable value', fmt(mode === 'inclusive' ? total - cgst - sgst : taxable)],
    [`CGST @ ${half.toFixed(2)}%`, fmt(cgst)],
    [`SGST @ ${half.toFixed(2)}%`, fmt(sgst)],
  ]

  return (
    <div className="rounded-xl bg-ink-50 p-4 font-mono text-[13px]">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between py-0.5 text-ink-600">
          <span>{label}</span>
          <span className="tabular">{value}</span>
        </div>
      ))}
      <div className="mt-2 flex justify-between border-t border-ink-300 pt-2 text-base font-bold text-ink-900">
        <span>Total</span>
        <span className="tabular">{fmt(total)}</span>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------- printer */

function PrinterTab({ draft, set }) {
  const toast = useToast()
  const [testing, setTesting] = useState(false)
  const [previewText, setPreviewText] = useState(null)
  const capabilities = printerService.capabilities()

  const transports = [
    { value: 'browser', label: 'Browser print dialog', available: capabilities.browser },
    { value: 'qz', label: 'QZ Tray (thermal, recommended)', available: capabilities.qz },
    { value: 'webusb', label: 'Direct USB (WebUSB)', available: capabilities.webusb },
    { value: 'bluetooth', label: 'Bluetooth (Web Bluetooth)', available: capabilities.bluetooth },
    { value: 'none', label: 'Do not print', available: true },
  ]

  async function runTest(kind) {
    setTesting(true)
    try {
      const payload = await settingsService.printerTest()
      const transport = kind === 'kot' ? draft['printer.kot_mode'] : draft['printer.receipt_mode']
      const printerName =
        kind === 'kot'
          ? draft['printer.kot_printer_name']
          : draft['printer.receipt_printer_name']

      setPreviewText(
        printerService.preview('test', payload, Number(draft['printer.paper_width'] || 80))
      )
      const result = await printerService.print('test', payload, {
        transport,
        printerName,
        paperWidth: draft['printer.paper_width'] || 80,
      })
      toast.success(result.message || 'Test job sent.')
    } catch (caught) {
      toast.error(caught.message || 'The printer did not accept the test job.')
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="card p-5">
        <h2 className="mb-1 font-display text-[15px] font-bold text-ink-900">Printers</h2>
        <p className="mb-4 text-[13px] text-ink-500">
          The printer is attached to this billing device, not the server, so these settings live
          per outlet.
        </p>

        <div className="space-y-4">
          <Select
            label="Receipt printing"
            value={draft['printer.receipt_mode'] || 'browser'}
            onChange={(event) => set('printer.receipt_mode', event.target.value)}
          >
            {transports.map((transport) => (
              <option key={transport.value} value={transport.value} disabled={!transport.available}>
                {transport.label}
                {!transport.available ? ' — not supported in this browser' : ''}
              </option>
            ))}
          </Select>
          {draft['printer.receipt_mode'] === 'qz' && (
            <Input
              label="Receipt printer name (as QZ Tray reports it)"
              value={draft['printer.receipt_printer_name'] || ''}
              onChange={(event) => set('printer.receipt_printer_name', event.target.value)}
            />
          )}

          <Select
            label="KOT printing"
            value={draft['printer.kot_mode'] || 'browser'}
            onChange={(event) => set('printer.kot_mode', event.target.value)}
          >
            {transports.map((transport) => (
              <option key={transport.value} value={transport.value} disabled={!transport.available}>
                {transport.label}
                {!transport.available ? ' — not supported in this browser' : ''}
              </option>
            ))}
          </Select>
          {draft['printer.kot_mode'] === 'qz' && (
            <Input
              label="Kitchen printer name"
              value={draft['printer.kot_printer_name'] || ''}
              onChange={(event) => set('printer.kot_printer_name', event.target.value)}
            />
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Paper width"
              value={draft['printer.paper_width'] || '80'}
              onChange={(event) => set('printer.paper_width', event.target.value)}
              options={[
                { value: '80', label: '80 mm (48 columns)' },
                { value: '58', label: '58 mm (32 columns)' },
              ]}
            />
            <Input
              label="QZ Tray host"
              value={draft['printer.qz_host'] || ''}
              onChange={(event) => set('printer.qz_host', event.target.value)}
            />
          </div>

          <Toggle
            checked={draft['printer.auto_print_receipt'] !== 'false'}
            onChange={(value) => set('printer.auto_print_receipt', value ? 'true' : 'false')}
            label="Print the receipt automatically after payment"
          />
          <Toggle
            checked={draft['printer.auto_print_kot'] !== 'false'}
            onChange={(value) => set('printer.auto_print_kot', value ? 'true' : 'false')}
            label="Print the KOT automatically when it is sent"
          />
        </div>

        <div className="mt-5 flex flex-wrap gap-2 border-t border-ink-100 pt-4">
          <Button
            variant="secondary"
            icon={<IconPrint className="h-4 w-4" />}
            onClick={() => runTest('receipt')}
            loading={testing}
          >
            Test receipt printer
          </Button>
          <Button
            variant="secondary"
            icon={<IconPrint className="h-4 w-4" />}
            onClick={() => runTest('kot')}
            loading={testing}
          >
            Test kitchen printer
          </Button>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="mb-1 font-display text-[15px] font-bold text-ink-900">
          What the printer receives
        </h2>
        <p className="mb-4 text-[13px] text-ink-500">
          Rendered at {draft['printer.paper_width'] || 80} mm.
        </p>
        {previewText ? (
          <pre className="overflow-x-auto rounded-xl bg-ink-950 p-4 font-mono text-[12px] leading-snug text-ink-100">
            {previewText}
          </pre>
        ) : (
          <EmptyState
            title="Run a test to preview"
            description="The preview shows the exact text a thermal printer would emit."
          />
        )}
      </section>
    </div>
  )
}

/* --------------------------------------------------------------- tables */

function TablesTab() {
  const toast = useToast()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [confirm, setConfirm] = useState(null)
  const [errors, setErrors] = useState({})

  const load = useCallback(async () => {
    try {
      const body = await tableService.list({ with_orders: false, active_only: false })
      setRows(body.data)
    } catch (caught) {
      toast.fromError(caught, 'Could not load tables.')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    load()
  }, [load])

  async function save() {
    if (!form.table_number?.trim()) {
      setErrors({ table_number: 'Enter a table number.' })
      return
    }
    setSaving(true)
    try {
      const payload = {
        table_number: form.table_number.trim(),
        seats: Number(form.seats || 4),
        is_active: form.is_active ?? true,
      }
      if (form.id) await tableService.update(form.id, payload)
      else await tableService.create(payload)
      toast.success('Table saved.')
      setForm(null)
      load()
    } catch (caught) {
      toast.fromError(caught, 'Could not save that table.')
    } finally {
      setSaving(false)
    }
  }

  async function remove(table) {
    setSaving(true)
    try {
      const result = await tableService.remove(table.id)
      toast.success(result.message)
      setConfirm(null)
      load()
    } catch (caught) {
      toast.fromError(caught, 'Could not remove that table.')
      setConfirm(null)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Button
          icon={<IconPlus className="h-4 w-4" />}
          onClick={() => {
            setErrors({})
            setForm({ table_number: '', seats: 4, is_active: true })
          }}
        >
          Add table
        </Button>
      </div>

      <DataTable
        loading={loading}
        rows={rows}
        columns={[
          {
            key: 'table_number',
            header: 'Table',
            render: (row) => <span className="font-display text-lg font-bold">{row.table_number}</span>,
          },
          { key: 'seats', header: 'Seats', align: 'center' },
          {
            key: 'status',
            header: 'Status',
            align: 'center',
            render: (row) => (
              <Badge
                tone={
                  row.status === 'empty'
                    ? 'success'
                    : row.status === 'occupied'
                      ? 'warning'
                      : 'danger'
                }
              >
                {row.status.replace('_', ' ')}
              </Badge>
            ),
          },
          {
            key: 'is_active',
            header: 'In service',
            align: 'center',
            render: (row) => (
              <Badge tone={row.is_active ? 'success' : 'neutral'}>
                {row.is_active ? 'Yes' : 'Retired'}
              </Badge>
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
                    setForm({ ...row })
                  }}
                  className="rounded-lg px-2 py-1 text-[13px] font-semibold text-brand-700 hover:bg-brand-50"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setConfirm(row)}
                  aria-label="Remove table"
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
            title="No tables configured"
            description="Add the tables on your floor. Tables only track active orders — there is no reservation system."
          />
        }
      />

      <Modal
        open={Boolean(form)}
        onClose={() => setForm(null)}
        title={form?.id ? 'Edit table' : 'Add table'}
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
              label="Table number"
              required
              value={form.table_number}
              error={errors.table_number}
              onChange={(event) => setForm({ ...form, table_number: event.target.value })}
            />
            <Input
              label="Seats"
              type="number"
              min="1"
              max="50"
              value={form.seats}
              onChange={(event) => setForm({ ...form, seats: event.target.value })}
            />
            <Toggle
              checked={form.is_active ?? true}
              onChange={(value) => setForm({ ...form, is_active: value })}
              label="In service"
              description="Retired tables stay in history but cannot take new orders."
            />
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(confirm)}
        title={`Remove table ${confirm?.table_number}?`}
        message="Tables with past orders are retired instead of deleted, so history stays intact."
        confirmLabel="Remove"
        loading={saving}
        onConfirm={() => remove(confirm)}
        onCancel={() => setConfirm(null)}
      />
    </div>
  )
}

/* -------------------------------------------------------------- account */

/**
 * Self-service only: the signed-in user can rotate their own password and see
 * their own shift log. There is no staff-management UI anywhere in this app —
 * accounts are provisioned by the setup script.
 */
function AccountTab() {
  const { user } = useAuth()
  const toast = useToast()
  const [form, setForm] = useState({ current_password: '', new_password: '', confirm: '' })
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [shifts, setShifts] = useState([])

  useEffect(() => {
    authService
      .shifts({ limit: 20 })
      .then(setShifts)
      .catch(() => setShifts([]))
  }, [])

  async function changePassword() {
    const next = {}
    if (!form.current_password) next.current_password = 'Enter your current password.'
    if (form.new_password.length < 8) next.new_password = 'Use at least 8 characters.'
    if (form.new_password !== form.confirm) next.confirm = 'The two passwords do not match.'
    setErrors(next)
    if (Object.keys(next).length) return

    setSaving(true)
    try {
      await authService.changePassword(form.current_password, form.new_password)
      toast.success('Password updated.')
      setForm({ current_password: '', new_password: '', confirm: '' })
    } catch (caught) {
      toast.fromError(caught, 'Could not change your password.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="card p-5">
        <h2 className="mb-1 font-display text-[15px] font-bold text-ink-900">Your account</h2>
        <p className="mb-4 text-[13px] text-ink-500">
          Signed in as <strong>{user?.username}</strong> ({user?.role}).
        </p>

        <div className="space-y-4">
          <Input
            label="Current password"
            type="password"
            autoComplete="current-password"
            value={form.current_password}
            error={errors.current_password}
            onChange={(event) => setForm({ ...form, current_password: event.target.value })}
          />
          <Input
            label="New password"
            type="password"
            autoComplete="new-password"
            value={form.new_password}
            error={errors.new_password}
            hint="At least 8 characters."
            onChange={(event) => setForm({ ...form, new_password: event.target.value })}
          />
          <Input
            label="Confirm new password"
            type="password"
            autoComplete="new-password"
            value={form.confirm}
            error={errors.confirm}
            onChange={(event) => setForm({ ...form, confirm: event.target.value })}
          />
          <Button onClick={changePassword} loading={saving}>
            Update password
          </Button>
        </div>

        <p className="mt-5 rounded-lg bg-ink-50 px-3 py-2.5 text-[13px] text-ink-600">
          Admin and cashier accounts are created during deployment by the setup script. This
          application has no staff-management screen.
        </p>
      </section>

      <section className="card p-5">
        <h2 className="mb-1 font-display text-[15px] font-bold text-ink-900">Shift log</h2>
        <p className="mb-4 text-[13px] text-ink-500">
          Login and logout times, recorded automatically for audit.
        </p>
        {shifts.length === 0 ? (
          <EmptyState title="No sessions recorded yet" />
        ) : (
          <ul className="max-h-96 divide-y divide-ink-100 overflow-y-auto">
            {shifts.map((shift) => (
              <li key={shift.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink-900">
                    {shift.user_name}
                    <span className="ml-1.5 text-[12px] font-normal uppercase text-ink-400">
                      {shift.role}
                    </span>
                  </p>
                  <p className="text-[13px] text-ink-500">{formatDateTime(shift.login_time)}</p>
                </div>
                {shift.is_open ? (
                  <Badge tone="success" dot>
                    On shift
                  </Badge>
                ) : (
                  <span className="text-[13px] text-ink-500">
                    until {formatDateTime(shift.logout_time)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
