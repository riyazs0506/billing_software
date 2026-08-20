import { Badge } from '../common/Bits'
import Button from '../common/Button'
import { IconAlert, IconEdit, IconPlus } from '../common/Icons'
import { trimDecimals } from '../../utils/format'

/**
 * One raw material: current stock, and the min–max servings it can produce for
 * each linked dish (Output = Stock × Yield per unit).
 */
export default function YieldCard({ material, onUpdateStock, onEdit, onLinkRecipe }) {
  const low = material.is_low_stock
  const links = material.linked_items || []

  return (
    <article
      className={`card flex flex-col p-4 transition ${
        low ? 'border-red-300 bg-red-50/60 ring-1 ring-red-200' : ''
      }`}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-display text-[17px] font-bold text-ink-900">
            {material.name}
          </h3>
          <p className="tabular mt-0.5 text-sm text-ink-500">
            <span className={`font-bold ${low ? 'text-red-700' : 'text-ink-800'}`}>
              {trimDecimals(material.current_stock)} {material.unit}
            </span>{' '}
            in stock
          </p>
        </div>
        {low && (
          <Badge tone="danger" className="shrink-0">
            <IconAlert className="h-3.5 w-3.5" />
            Low
          </Badge>
        )}
      </header>

      <div className="mt-3.5 min-h-[4.5rem] flex-1">
        {links.length === 0 ? (
          <div className="rounded-lg border border-dashed border-ink-300 px-3 py-3 text-center">
            <p className="text-[13px] text-ink-500">No dish is linked to this material yet.</p>
            <button
              type="button"
              onClick={() => onLinkRecipe(material)}
              className="mt-1 text-[13px] font-semibold text-brand-700 hover:underline"
            >
              Configure a yield →
            </button>
          </div>
        ) : (
          <ul className="space-y-2">
            {links.map((link) => (
              <li
                key={link.menu_item_id}
                className="rounded-lg bg-white/70 px-3 py-2 ring-1 ring-ink-100"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[13px] font-semibold text-ink-700">
                    {link.menu_item_name}
                  </span>
                  <span className="tabular shrink-0 font-display text-[17px] font-bold text-brand-800">
                    {link.min_output}–{link.max_output}
                  </span>
                </div>
                <p className="tabular mt-0.5 text-[12px] text-ink-500">
                  {trimDecimals(link.min_yield_per_unit)}–{trimDecimals(link.max_yield_per_unit)}{' '}
                  per {material.unit} · {trimDecimals(link.avg_consumption_per_dish)}{' '}
                  {material.unit}/dish
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <footer className="mt-3.5 flex flex-wrap gap-1.5 border-t border-ink-100 pt-3">
        <Button size="sm" variant="primary" onClick={() => onUpdateStock(material)}>
          Update stock
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={<IconPlus className="h-4 w-4" />}
          onClick={() => onLinkRecipe(material)}
        >
          Yield
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={<IconEdit className="h-4 w-4" />}
          onClick={() => onEdit(material)}
          className="ml-auto"
        >
          Edit
        </Button>
      </footer>
    </article>
  )
}
