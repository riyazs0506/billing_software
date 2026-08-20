import { formatMoney } from '../../utils/format'
import { EmptyState } from '../common/States'
import { IconMinus, IconPlus, IconTrash } from '../common/Icons'

/** One line of the running bill: item, qty +/-, remove, line total. */
function BillItemRow({ line, currency, onIncrement, onDecrement, onRemove, busy, locked }) {
  return (
    <li className="flex items-start gap-3 border-b border-ink-100 px-3 py-2.5 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold leading-snug text-ink-900">
          {line.name}
        </p>
        <p className="tabular mt-0.5 text-[13px] text-ink-500">
          {formatMoney(line.price_at_order, currency)} each
          {line.kot_sent && (
            <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
              in kitchen
            </span>
          )}
        </p>
        {line.note && (
          <p className="mt-1 truncate text-[12px] italic text-ink-500">“{line.note}”</p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1 rounded-lg bg-ink-100 p-0.5">
        <button
          type="button"
          onClick={() => onDecrement(line)}
          disabled={busy || locked}
          aria-label={`Reduce ${line.name}`}
          className="tap grid h-8 w-8 place-items-center rounded-md bg-white text-ink-700 shadow-sm transition hover:bg-brand-50 hover:text-brand-800 disabled:opacity-40"
        >
          <IconMinus className="h-4 w-4" />
        </button>
        <span className="tabular w-8 text-center text-[15px] font-bold text-ink-900">
          {line.quantity}
        </span>
        <button
          type="button"
          onClick={() => onIncrement(line)}
          disabled={busy || locked}
          aria-label={`Add another ${line.name}`}
          className="tap grid h-8 w-8 place-items-center rounded-md bg-white text-ink-700 shadow-sm transition hover:bg-brand-50 hover:text-brand-800 disabled:opacity-40"
        >
          <IconPlus className="h-4 w-4" />
        </button>
      </div>

      <div className="w-20 shrink-0 text-right">
        <p className="tabular text-[15px] font-bold text-ink-900">
          {formatMoney(line.line_total, currency)}
        </p>
        <button
          type="button"
          onClick={() => onRemove(line)}
          disabled={busy || locked}
          aria-label={`Remove ${line.name}`}
          className="mt-1 inline-flex items-center gap-1 rounded px-1 py-0.5 text-[12px] font-semibold text-ink-400 transition hover:text-red-600 disabled:opacity-40"
        >
          <IconTrash className="h-3.5 w-3.5" />
          Remove
        </button>
      </div>
    </li>
  )
}

export default function OrderPanel({
  order,
  currency = '₹',
  onIncrement,
  onDecrement,
  onRemove,
  busy = false,
  locked = false,
  header = null,
}) {
  const lines = order?.items || []

  return (
    <div className="flex h-full min-h-0 flex-col">
      {header}
      {lines.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            title="No items yet"
            description="Tap a dish on the left to start the order."
            icon={
              <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.6"
                  d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.3 2.3A1 1 0 005.4 17H17M9 21a1 1 0 100-2 1 1 0 000 2zm8 0a1 1 0 100-2 1 1 0 000 2z"
                />
              </svg>
            }
          />
        </div>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {lines.map((line) => (
            <BillItemRow
              key={line.id}
              line={line}
              currency={currency}
              onIncrement={onIncrement}
              onDecrement={onDecrement}
              onRemove={onRemove}
              busy={busy}
              locked={locked || Boolean(line.bill_id)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
