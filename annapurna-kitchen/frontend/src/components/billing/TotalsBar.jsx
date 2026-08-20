import { formatMoney } from '../../utils/format'
import Button from '../common/Button'
import { IconKitchen, IconSplit } from '../common/Icons'

function Line({ label, value, tone = 'default', size = 'sm' }) {
  const tones = {
    default: 'text-ink-600',
    discount: 'text-emerald-700',
    muted: 'text-ink-400',
  }
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className={`${size === 'sm' ? 'text-[13px]' : 'text-sm'} ${tones[tone]}`}>{label}</span>
      <span
        className={`tabular ${
          size === 'sm' ? 'text-[13px]' : 'text-sm'
        } font-semibold ${tone === 'discount' ? 'text-emerald-700' : 'text-ink-800'}`}
      >
        {value}
      </span>
    </div>
  )
}

/**
 * Bottom bar of the POS: discount indicator, GST breakup, total, and the one
 * primary action. No confirmation step — speed matters at a counter.
 */
export default function TotalsBar({
  totals,
  discount,
  currency = '₹',
  onGenerate,
  onSendKot,
  onSplit,
  generating = false,
  sendingKot = false,
  canGenerate = false,
  canSendKot = false,
  canSplit = false,
  calculating = false,
}) {
  const hasDiscount = Number(totals?.discount_applied || 0) > 0
  const hasTax = Number(totals?.cgst || 0) > 0 || Number(totals?.sgst || 0) > 0

  return (
    <div className="border-t border-ink-200 bg-white px-4 py-3.5">
      {hasDiscount && (
        <div className="mb-2.5 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-emerald-600 text-white">
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeWidth="2.2" d="M9 15l6-6M9.5 9.5h.01M14.5 14.5h.01" />
            </svg>
          </span>
          <span className="min-w-0 flex-1 text-[13px] font-semibold text-emerald-900">
            {discount?.label || 'Discount'} · {totals.discount_percentage}% applied automatically
          </span>
        </div>
      )}

      <div className="space-y-1">
        <Line label="Subtotal" value={formatMoney(totals?.subtotal, currency)} />
        {hasDiscount && (
          <Line
            label={`Discount (${totals.discount_percentage}%)`}
            value={`− ${formatMoney(totals.discount_applied, currency)}`}
            tone="discount"
          />
        )}
        {hasTax && (
          <>
            <Line
              label={`CGST @ ${totals.cgst_rate}%`}
              value={formatMoney(totals.cgst, currency)}
            />
            <Line
              label={`SGST @ ${totals.sgst_rate}%`}
              value={formatMoney(totals.sgst, currency)}
            />
          </>
        )}
      </div>

      <div className="mt-3 flex items-end justify-between gap-3 border-t border-dashed border-ink-200 pt-3">
        <span className="text-[13px] font-bold uppercase tracking-[0.06em] text-ink-500">
          Total
          {totals?.tax_mode === 'inclusive' && (
            <span className="ml-1 font-medium normal-case tracking-normal text-ink-400">
              (incl. GST)
            </span>
          )}
        </span>
        <span
          className={`tabular font-display text-[30px] font-bold leading-none tracking-tight text-ink-950 transition ${
            calculating ? 'opacity-40' : ''
          }`}
        >
          {formatMoney(totals?.total, currency)}
        </span>
      </div>

      <div className="mt-3.5 flex gap-2">
        <Button
          variant="secondary"
          size="lg"
          onClick={onSendKot}
          loading={sendingKot}
          disabled={!canSendKot}
          icon={<IconKitchen className="h-[18px] w-[18px]" />}
          className="shrink-0"
          title="Send new items to the kitchen (F2)"
        >
          KOT
        </Button>
        {canSplit && (
          <Button
            variant="secondary"
            size="lg"
            onClick={onSplit}
            icon={<IconSplit className="h-[18px] w-[18px]" />}
            className="shrink-0"
            title="Split this table into separate bills"
          >
            Split
          </Button>
        )}
        <Button
          size="lg"
          fullWidth
          onClick={onGenerate}
          loading={generating}
          disabled={!canGenerate}
          className="text-base"
          title="Generate the bill (F4)"
        >
          Generate Bill
        </Button>
      </div>
    </div>
  )
}
