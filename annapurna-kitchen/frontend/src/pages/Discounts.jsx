import { useCallback, useEffect, useState } from 'react'
import { useToast } from '../context/ToastContext'
import discountService from '../services/discountService'
import Button from '../components/common/Button'
import Modal from '../components/common/Modal'
import DataTable from '../components/common/DataTable'
import { Input, Toggle } from '../components/common/Field'
import { Badge, ConfirmDialog, PageHeader } from '../components/common/Bits'
import { EmptyState, ErrorState, Loader } from '../components/common/States'
import { IconDiscount, IconPlus, IconTrash } from '../components/common/Icons'
import { formatDate, todayIso } from '../utils/format'

export default function Discounts() {
  const toast = useToast()

  const [globalRule, setGlobalRule] = useState(null)
  const [rules, setRules] = useState([])
  const [active, setActive] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const [special, setSpecial] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [errors, setErrors] = useState({})
  const [probeDate, setProbeDate] = useState(todayIso())
  const [probeResult, setProbeResult] = useState(null)

  // The percentage field is an explicit draft: typing never saves on its own,
  // so a half-typed "1" can never be committed as a 1% discount.
  const [percentDraft, setPercentDraft] = useState('0')
  const [percentError, setPercentError] = useState(null)
  const percentDirty = percentDraft !== String(globalRule?.percentage ?? '0')

  function savePercentage() {
    const value = Number(percentDraft)
    if (percentDraft === '' || Number.isNaN(value) || value < 0 || value > 100) {
      setPercentError('Enter a percentage between 0 and 100.')
      return
    }
    saveGlobal({ percentage: percentDraft })
  }

  const load = useCallback(async () => {
    setError(null)
    try {
      const [body, current] = await Promise.all([
        discountService.list(),
        discountService.getGlobal(),
      ])
      setRules(body.data.filter((rule) => rule.type === 'special_date'))
      setGlobalRule(current)
      setPercentDraft(String(current?.percentage ?? '0'))
      setActive(body.active)
    } catch (caught) {
      setError(caught)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function saveGlobal(patch) {
    setSaving(true)
    try {
      const body = await discountService.setGlobal(patch)
      setGlobalRule(body)
      setPercentDraft(String(body?.percentage ?? '0'))
      setPercentError(null)
      const refreshed = await discountService.active()
      setActive(refreshed)
      toast.success('Global discount updated. It applies to new bills only.')
    } catch (caught) {
      toast.fromError(caught, 'Could not update the global discount.')
      load()
    } finally {
      setSaving(false)
    }
  }

  async function saveSpecial() {
    const next = {}
    if (special.percentage === '' || Number(special.percentage) <= 0) {
      next.percentage = 'Enter a percentage between 0 and 100.'
    }
    if (!special.start_date) next.start_date = 'Pick a start date.'
    if (!special.end_date) next.end_date = 'Pick an end date.'
    if (special.start_date && special.end_date && special.end_date < special.start_date) {
      next.end_date = 'The end date cannot be before the start date.'
    }
    setErrors(next)
    if (Object.keys(next).length) return

    setSaving(true)
    try {
      const payload = {
        type: 'special_date',
        name: special.name?.trim() || null,
        percentage: String(special.percentage),
        start_date: special.start_date,
        end_date: special.end_date,
        is_active: special.is_active ?? true,
      }
      if (special.id) await discountService.update(special.id, payload)
      else await discountService.create(payload)
      toast.success('Special-date discount saved. It activates itself on schedule.')
      setSpecial(null)
      load()
    } catch (caught) {
      toast.fromError(caught, 'Could not save that discount.')
    } finally {
      setSaving(false)
    }
  }

  async function removeSpecial(rule) {
    setSaving(true)
    try {
      await discountService.remove(rule.id)
      toast.success('Discount deleted.')
      setConfirm(null)
      load()
    } catch (caught) {
      toast.fromError(caught, 'Could not delete that discount.')
    } finally {
      setSaving(false)
    }
  }

  async function probe(date) {
    setProbeDate(date)
    try {
      setProbeResult(await discountService.evaluateOn(date))
    } catch {
      setProbeResult(null)
    }
  }

  if (error) return <ErrorState error={error} onRetry={load} />
  if (loading) return <Loader label="Loading discount rules…" />

  const today = todayIso()

  return (
    <div>
      <PageHeader
        title="Discounts"
        subtitle="A global switch plus scheduled special dates. Rules are evaluated when a bill is generated — settled bills are never recalculated."
        actions={
          <Button
            icon={<IconPlus className="h-4 w-4" />}
            onClick={() => {
              setErrors({})
              setSpecial({
                name: '',
                percentage: '',
                start_date: today,
                end_date: today,
                is_active: true,
              })
            }}
          >
            Schedule a date
          </Button>
        }
      />

      {/* currently active */}
      <div
        className={`card mb-5 flex flex-wrap items-center gap-4 p-5 ${
          Number(active?.percentage) > 0 ? 'border-emerald-300 bg-emerald-50' : ''
        }`}
      >
        <span
          className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${
            Number(active?.percentage) > 0
              ? 'bg-emerald-600 text-white'
              : 'bg-ink-100 text-ink-400'
          }`}
        >
          <IconDiscount className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-bold uppercase tracking-wide text-ink-500">
            Applying right now
          </p>
          <p className="font-display text-xl font-bold text-ink-900">
            {Number(active?.percentage) > 0
              ? `${active.percentage}% — ${active.label}`
              : 'No discount active'}
          </p>
          <p className="mt-0.5 text-[13px] text-ink-500">
            {Number(active?.percentage) > 0
              ? 'Every new bill gets this automatically. The cashier does not type anything.'
              : 'Bills are generated at full price.'}
          </p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[22rem_1fr]">
        {/* the ON/OFF switch */}
        <section className="card h-fit p-5">
          <h2 className="font-display text-[15px] font-bold text-ink-900">Global discount</h2>
          <p className="mt-0.5 text-[13px] text-ink-500">
            One switch that applies to every bill until it is turned off.
          </p>

          <div className="mt-4">
            <Toggle
              checked={globalRule?.is_active || false}
              onChange={(value) => saveGlobal({ is_active: value })}
              disabled={saving}
              label={globalRule?.is_active ? 'Switched ON' : 'Switched OFF'}
              description={
                globalRule?.is_active
                  ? `${globalRule.percentage}% off every new bill`
                  : 'No global discount is being applied'
              }
            />
          </div>

          <div className="mt-4">
            <Input
              label="Percentage"
              type="number"
              step="0.01"
              min="0"
              max="100"
              suffix="%"
              value={percentDraft}
              error={percentError}
              onChange={(event) => {
                setPercentDraft(event.target.value)
                setPercentError(null)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') savePercentage()
              }}
              hint="Applies to bills generated from the moment you save."
            />
            <div className="mt-2 flex items-center gap-2">
              <Button
                variant={percentDirty ? 'primary' : 'secondary'}
                size="sm"
                loading={saving}
                disabled={!percentDirty}
                onClick={savePercentage}
              >
                {percentDirty ? 'Save percentage' : 'Saved'}
              </Button>
              {percentDirty && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setPercentDraft(String(globalRule?.percentage ?? '0'))
                    setPercentError(null)
                  }}
                >
                  Reset
                </Button>
              )}
            </div>
          </div>

          <div className="mt-5 border-t border-ink-100 pt-4">
            <label className="label" htmlFor="probe-date">
              What would apply on…
            </label>
            <input
              id="probe-date"
              type="date"
              value={probeDate}
              onChange={(event) => probe(event.target.value)}
              className="field"
            />
            {probeResult && (
              <p className="mt-2 rounded-lg bg-ink-50 px-3 py-2 text-[13px] text-ink-700">
                {Number(probeResult.percentage) > 0
                  ? `${probeResult.percentage}% — ${probeResult.label}`
                  : 'No discount on that date.'}
              </p>
            )}
          </div>
        </section>

        {/* special dates */}
        <section>
          <h2 className="section-title mb-2">Special-date schedule</h2>
          <DataTable
            rows={rules}
            columns={[
              {
                key: 'name',
                header: 'Occasion',
                render: (row) => (
                  <span className="font-semibold">{row.name || 'Special date'}</span>
                ),
              },
              {
                key: 'percentage',
                header: 'Discount',
                align: 'center',
                render: (row) => <Badge tone="brand">{row.percentage}%</Badge>,
              },
              {
                key: 'range',
                header: 'Runs',
                render: (row) => (
                  <span className="text-[13px]">
                    {formatDate(row.start_date)} → {formatDate(row.end_date)}
                  </span>
                ),
              },
              {
                key: 'state',
                header: 'Status',
                align: 'center',
                render: (row) => {
                  if (!row.is_active) return <Badge tone="neutral">Disabled</Badge>
                  if (row.start_date <= today && row.end_date >= today) {
                    return <Badge tone="success" dot>Live now</Badge>
                  }
                  if (row.start_date > today) return <Badge tone="info">Scheduled</Badge>
                  return <Badge tone="neutral">Finished</Badge>
                },
              },
              {
                key: 'actions',
                header: '',
                align: 'right',
                width: '8rem',
                render: (row) => (
                  <div className="flex justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setErrors({})
                        setSpecial({ ...row })
                      }}
                      className="rounded-lg px-2 py-1 text-[13px] font-semibold text-brand-700 hover:bg-brand-50"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirm(row)}
                      aria-label="Delete"
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
                title="No special dates scheduled"
                description="Schedule a festival or anniversary discount — it activates itself on the day, with no manual toggling."
              />
            }
          />
        </section>
      </div>

      <Modal
        open={Boolean(special)}
        onClose={() => setSpecial(null)}
        title={special?.id ? 'Edit special-date discount' : 'Schedule a special-date discount'}
        subtitle="It turns itself on and off within this range."
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setSpecial(null)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={saveSpecial} loading={saving}>
              Save
            </Button>
          </>
        }
      >
        {special && (
          <div className="space-y-4">
            <Input
              data-autofocus
              label="Occasion"
              placeholder="Diwali special, Anniversary week…"
              value={special.name || ''}
              onChange={(event) => setSpecial({ ...special, name: event.target.value })}
            />
            <Input
              label="Discount percentage"
              required
              type="number"
              step="0.01"
              min="0"
              max="100"
              suffix="%"
              value={special.percentage}
              error={errors.percentage}
              onChange={(event) => setSpecial({ ...special, percentage: event.target.value })}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Start date"
                required
                type="date"
                value={special.start_date || ''}
                error={errors.start_date}
                onChange={(event) => setSpecial({ ...special, start_date: event.target.value })}
              />
              <Input
                label="End date"
                required
                type="date"
                value={special.end_date || ''}
                error={errors.end_date}
                onChange={(event) => setSpecial({ ...special, end_date: event.target.value })}
              />
            </div>
            <Toggle
              checked={special.is_active ?? true}
              onChange={(value) => setSpecial({ ...special, is_active: value })}
              label="Enabled"
              description="Disable to keep the schedule without letting it fire."
            />
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(confirm)}
        title="Delete this discount?"
        message="Bills already generated with it keep their discount — nothing is recalculated."
        confirmLabel="Delete"
        loading={saving}
        onConfirm={() => removeSpecial(confirm)}
        onCancel={() => setConfirm(null)}
      />
    </div>
  )
}
