import { useEffect, useState } from 'react'
import Modal from '../common/Modal'
import Button from '../common/Button'
import { Input } from '../common/Field'
import { Loader } from '../common/States'
import { IconSearch, IconUser } from '../common/Icons'
import customerService from '../../services/customerService'
import { useToast } from '../../context/ToastContext'
import useDebounce from '../../hooks/useDebounce'

/**
 * Search-or-add a customer without leaving the billing screen.
 * A cashier is allowed to do exactly this and nothing more (07-Role-Access).
 */
export default function CustomerPicker({ open, onClose, onSelect, selected }) {
  const toast = useToast()
  const [term, setTerm] = useState('')
  const debounced = useDebounce(term, 250)
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ name: '', phone: '' })
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) {
      setTerm('')
      setResults([])
      setCreating(false)
      setForm({ name: '', phone: '' })
      setErrors({})
    }
  }, [open])

  useEffect(() => {
    let cancelled = false
    if (debounced.trim().length < 2) {
      setResults([])
      return undefined
    }
    setSearching(true)
    customerService
      .search(debounced.trim())
      .then((rows) => {
        if (!cancelled) setResults(rows)
      })
      .catch(() => {
        if (!cancelled) setResults([])
      })
      .finally(() => {
        if (!cancelled) setSearching(false)
      })
    return () => {
      cancelled = true
    }
  }, [debounced])

  async function createCustomer() {
    const nextErrors = {}
    if (!form.name.trim()) nextErrors.name = 'Enter a name.'
    if (!/^\d{10,15}$/.test(form.phone.replace(/\D/g, ''))) {
      nextErrors.phone = 'Enter a valid 10-digit phone number.'
    }
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return

    setSaving(true)
    try {
      const customer = await customerService.create({
        name: form.name.trim(),
        phone: form.phone.replace(/\D/g, ''),
      })
      toast.success(`${customer.name} attached to this bill.`)
      onSelect(customer)
      onClose()
    } catch (error) {
      toast.fromError(error, 'Could not save that customer.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Customer"
      subtitle="Search by phone or name, or add a new one."
      size="md"
      footer={
        <>
          {selected && (
            <Button
              variant="ghost"
              onClick={() => {
                onSelect(null)
                onClose()
              }}
            >
              Remove from bill
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          {creating && (
            <Button onClick={createCustomer} loading={saving}>
              Save & attach
            </Button>
          )}
        </>
      }
    >
      {!creating ? (
        <>
          <div className="relative">
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <input
              data-autofocus
              type="search"
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="Phone number or name…"
              aria-label="Search customers"
              className="field pl-9"
            />
          </div>

          <div className="mt-4 min-h-[8rem]">
            {searching && <Loader label="Searching…" className="py-6" />}
            {!searching && term.trim().length >= 2 && results.length === 0 && (
              <p className="py-6 text-center text-sm text-ink-500">
                No customer matches “{term}”.
              </p>
            )}
            {!searching && term.trim().length < 2 && (
              <p className="py-6 text-center text-sm text-ink-400">
                Type at least 2 characters to search.
              </p>
            )}
            <ul className="space-y-1.5">
              {results.map((customer) => (
                <li key={customer.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(customer)
                      onClose()
                    }}
                    className="tap flex w-full items-center gap-3 rounded-lg border border-ink-200 px-3 py-2.5 text-left transition hover:border-brand-300 hover:bg-brand-50"
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-100 text-brand-700">
                      <IconUser className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink-900">
                        {customer.name}
                      </span>
                      <span className="tabular block text-[13px] text-ink-500">
                        {customer.phone}
                      </span>
                    </span>
                    {customer.loyalty_points > 0 && (
                      <span className="chip bg-saffron-100 text-saffron-800">
                        {customer.loyalty_points} pts
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <Button
            variant="outline"
            fullWidth
            className="mt-4"
            onClick={() => {
              const digits = term.replace(/\D/g, '')
              setForm({ name: digits ? '' : term, phone: digits })
              setCreating(true)
            }}
          >
            + Add a new customer
          </Button>
        </>
      ) : (
        <div className="space-y-4">
          <Input
            data-autofocus
            label="Name"
            required
            value={form.name}
            error={errors.name}
            onChange={(event) => setForm((f) => ({ ...f, name: event.target.value }))}
          />
          <Input
            label="Phone"
            required
            inputMode="numeric"
            value={form.phone}
            error={errors.phone}
            hint="10 digits, no spaces."
            onChange={(event) => setForm((f) => ({ ...f, phone: event.target.value }))}
          />
          <Button variant="ghost" size="sm" onClick={() => setCreating(false)}>
            ← Back to search
          </Button>
        </div>
      )}
    </Modal>
  )
}
