import Button from './Button'
import Modal from './Modal'
import { formatMoney } from '../../utils/format'

const BADGE_TONES = {
  neutral: 'bg-ink-100 text-ink-700',
  brand: 'bg-brand-100 text-brand-800',
  success: 'bg-emerald-100 text-emerald-800',
  warning: 'bg-amber-100 text-amber-800',
  danger: 'bg-red-100 text-red-700',
  info: 'bg-sky-100 text-sky-800',
  saffron: 'bg-saffron-100 text-saffron-800',
}

export function Badge({ tone = 'neutral', children, className = '', dot = false }) {
  return (
    <span className={`chip ${BADGE_TONES[tone] || BADGE_TONES.neutral} ${className}`}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  )
}

export function PageHeader({ title, subtitle, actions, breadcrumb }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {breadcrumb && (
          <p className="mb-1 text-[13px] font-semibold uppercase tracking-[0.08em] text-brand-600">
            {breadcrumb}
          </p>
        )}
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink-900 sm:text-[28px]">
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-sm text-ink-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'neutral',
  loading = false,
  onClick,
}) {
  const tones = {
    neutral: 'bg-ink-100 text-ink-600',
    brand: 'bg-brand-100 text-brand-700',
    success: 'bg-emerald-100 text-emerald-700',
    warning: 'bg-amber-100 text-amber-700',
    danger: 'bg-red-100 text-red-600',
    info: 'bg-sky-100 text-sky-700',
    saffron: 'bg-saffron-100 text-saffron-700',
  }
  const Wrapper = onClick ? 'button' : 'div'
  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`card p-4 text-left sm:p-5 ${onClick ? 'card-hover cursor-pointer' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-semibold uppercase tracking-[0.05em] text-ink-500">
          {label}
        </p>
        {icon && (
          <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${tones[tone]}`}>
            {icon}
          </span>
        )}
      </div>
      {loading ? (
        <div className="skeleton mt-3 h-8 w-2/3" />
      ) : (
        <p className="tabular mt-2 font-display text-[26px] font-bold leading-none tracking-tight text-ink-900">
          {value}
        </p>
      )}
      {hint && <p className="mt-2 text-[13px] text-ink-500">{hint}</p>}
    </Wrapper>
  )
}

export function Money({ value, symbol = '₹', className = '', muted = false }) {
  return (
    <span className={`tabular ${muted ? 'text-ink-500' : ''} ${className}`}>
      {formatMoney(value, symbol)}
    </span>
  )
}

export function ConfirmDialog({
  open,
  title = 'Are you sure?',
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  loading = false,
  onConfirm,
  onCancel,
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={variant} onClick={onConfirm} loading={loading} data-autofocus>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-ink-700">{message}</p>
    </Modal>
  )
}

export function SegmentedControl({ options, value, onChange, size = 'md', className = '' }) {
  const pad = size === 'lg' ? 'px-5 py-2.5 text-[15px]' : 'px-3.5 py-2 text-sm'
  return (
    <div
      role="tablist"
      className={`inline-flex rounded-xl border border-ink-200 bg-ink-100 p-1 ${className}`}
    >
      {options.map((option) => {
        const active = value === option.value
        return (
          <button
            key={option.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={`tap rounded-lg font-semibold transition ${pad} ${
              active
                ? 'bg-white text-brand-800 shadow-sm'
                : 'text-ink-600 hover:text-ink-900'
            }`}
          >
            {option.icon && <span className="mr-1.5 inline-block align-middle">{option.icon}</span>}
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

export function Tabs({ tabs, active, onChange, className = '' }) {
  return (
    <div className={`border-b border-ink-200 ${className}`}>
      <div role="tablist" className="-mb-px flex gap-1 overflow-x-auto">
        {tabs.map((tab) => {
          const selected = active === tab.value
          return (
            <button
              key={tab.value}
              role="tab"
              type="button"
              aria-selected={selected}
              onClick={() => onChange(tab.value)}
              className={`tap whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
                selected
                  ? 'border-brand-600 text-brand-800'
                  : 'border-transparent text-ink-500 hover:border-ink-300 hover:text-ink-800'
              }`}
            >
              {tab.label}
              {tab.count != null && (
                <span
                  className={`ml-2 rounded-full px-1.5 py-0.5 text-[11px] font-bold ${
                    selected ? 'bg-brand-100 text-brand-800' : 'bg-ink-100 text-ink-600'
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function DateRangeBar({ start, end, onChange, presets = [], right = null }) {
  return (
    <div className="card mb-5 flex flex-wrap items-end gap-3 p-4">
      <div>
        <label className="label" htmlFor="range-start">
          From
        </label>
        <input
          id="range-start"
          type="date"
          value={start}
          max={end}
          onChange={(event) => onChange(event.target.value, end)}
          className="field w-auto"
        />
      </div>
      <div>
        <label className="label" htmlFor="range-end">
          To
        </label>
        <input
          id="range-end"
          type="date"
          value={end}
          min={start}
          onChange={(event) => onChange(start, event.target.value)}
          className="field w-auto"
        />
      </div>
      {presets.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pb-0.5">
          {presets.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => onChange(preset.start_date, preset.end_date)}
              className={`rounded-lg px-2.5 py-1.5 text-[13px] font-semibold transition ${
                start === preset.start_date && end === preset.end_date
                  ? 'bg-brand-700 text-white'
                  : 'bg-ink-100 text-ink-700 hover:bg-ink-200'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      )}
      {right && <div className="ml-auto flex flex-wrap items-center gap-2">{right}</div>}
    </div>
  )
}
