import { useMemo, useState } from 'react'
import { formatMoney } from '../../utils/format'
import { EmptyState, SkeletonGrid } from '../common/States'
import { IconSearch, IconX } from '../common/Icons'

/**
 * Left panel of the POS: menu grid grouped by category tabs.
 * Large tap targets; unavailable items are visibly disabled and unclickable.
 */
export default function MenuGrid({ categories = [], loading, currency = '₹', onPick, disabled }) {
  const [activeCategory, setActiveCategory] = useState('all')
  const [search, setSearch] = useState('')

  const allItems = useMemo(
    () => categories.flatMap((category) => category.items || []),
    [categories]
  )

  const items = useMemo(() => {
    const pool =
      activeCategory === 'all'
        ? allItems
        : categories.find((category) => category.id === activeCategory)?.items || []
    const term = search.trim().toLowerCase()
    if (!term) return pool
    return pool.filter((item) => item.name.toLowerCase().includes(term))
  }, [activeCategory, allItems, categories, search])

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-10 w-full" />
        <SkeletonGrid count={12} />
      </div>
    )
  }

  const tabs = [
    { id: 'all', name: 'All', count: allItems.length },
    ...categories.map((category) => ({
      id: category.id,
      name: category.name,
      count: (category.items || []).length,
    })),
  ]

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* search */}
      <div className="relative mb-3">
        <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search the menu…"
          aria-label="Search menu items"
          className="field py-2.5 pl-9 pr-9"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            aria-label="Clear search"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-ink-400 hover:bg-ink-100"
          >
            <IconX className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* category tabs */}
      <div
        role="tablist"
        aria-label="Menu categories"
        className="mb-3 flex gap-1.5 overflow-x-auto pb-1"
      >
        {tabs.map((tab) => {
          const active = activeCategory === tab.id
          return (
            <button
              key={tab.id}
              role="tab"
              type="button"
              aria-selected={active}
              onClick={() => setActiveCategory(tab.id)}
              className={`tap whitespace-nowrap rounded-xl px-4 py-2 text-sm font-bold transition ${
                active
                  ? 'bg-brand-700 text-white shadow-sm'
                  : 'bg-white text-ink-600 shadow-sm ring-1 ring-ink-200 hover:bg-brand-50 hover:text-brand-800'
              }`}
            >
              {tab.name}
              <span className={`ml-1.5 text-[11px] ${active ? 'text-brand-200' : 'text-ink-400'}`}>
                {tab.count}
              </span>
            </button>
          )
        })}
      </div>

      {/* item grid */}
      <div className="min-h-0 flex-1 overflow-y-auto pb-2 pr-0.5">
        {items.length === 0 ? (
          <EmptyState
            title={search ? 'No matching dishes' : 'No items in this category'}
            description={
              search
                ? `Nothing matches "${search}".`
                : 'Add items from Menu Management to see them here.'
            }
          />
        ) : (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {items.map((item) => {
              const unavailable = !item.is_available
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={unavailable || disabled}
                  onClick={() => onPick(item)}
                  aria-label={`${item.name}, ${formatMoney(item.price, currency)}${
                    unavailable ? ', unavailable' : ''
                  }`}
                  className={`group relative flex min-h-[92px] flex-col justify-between rounded-xl border p-3 text-left transition ${
                    unavailable
                      ? 'cursor-not-allowed border-ink-200 bg-ink-100/70'
                      : 'border-ink-200 bg-white shadow-sm hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-lift active:translate-y-0 active:bg-brand-50'
                  }`}
                >
                  <span
                    className={`line-clamp-2 text-[15px] font-semibold leading-snug ${
                      unavailable ? 'text-ink-400' : 'text-ink-900'
                    }`}
                  >
                    {item.name}
                  </span>
                  <span className="mt-2 flex items-end justify-between gap-2">
                    <span
                      className={`tabular font-display text-[17px] font-bold ${
                        unavailable ? 'text-ink-400' : 'text-brand-800'
                      }`}
                    >
                      {formatMoney(item.price, currency)}
                    </span>
                    {unavailable ? (
                      <span className="chip bg-ink-200 text-ink-600">Unavailable</span>
                    ) : (
                      <span className="grid h-6 w-6 place-items-center rounded-full bg-brand-100 text-brand-700 opacity-0 transition group-hover:opacity-100">
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeWidth="2.5" d="M12 5v14M5 12h14" />
                        </svg>
                      </span>
                    )}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
