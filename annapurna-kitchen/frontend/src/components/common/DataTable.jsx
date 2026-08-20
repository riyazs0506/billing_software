import { EmptyState, SkeletonTable } from './States'

/**
 * Responsive-visibility classes, written out in full.
 *
 * These MUST be literal strings: Tailwind's JIT scans source text, so a
 * template-built name like `hidden ${bp}:table-cell` is never generated and
 * the column would stay hidden at every width.
 */
const HIDE_BELOW = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
  xl: 'hidden xl:table-cell',
}

/**
 * Responsive table. Columns declare {key, header, render, align, width,
 * className, hideBelow}. Below `lg` the table scrolls horizontally inside its
 * own container so the page never scrolls sideways.
 */
export default function DataTable({
  columns,
  rows,
  loading = false,
  empty = null,
  rowKey = (row, index) => row.id ?? index,
  onRowClick = null,
  footer = null,
  dense = false,
  className = '',
}) {
  if (loading) return <SkeletonTable cols={columns.length} />

  if (!rows || rows.length === 0) {
    return (
      <div className="card">
        {empty || <EmptyState title="Nothing here yet" description="Records will appear here." />}
      </div>
    )
  }

  const align = { right: 'text-right', center: 'text-center', left: 'text-left' }
  const pad = dense ? 'px-4 py-2.5' : 'px-5 py-3.5'

  return (
    <div className={`card overflow-hidden ${className}`}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-ink-100 bg-ink-50/80">
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  style={column.width ? { width: column.width } : undefined}
                  className={`${pad} text-[12px] font-bold uppercase tracking-[0.06em] text-ink-500 ${
                    align[column.align] || align.left
                  } ${HIDE_BELOW[column.hideBelow] || ''}`}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={rowKey(row, index)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`border-b border-ink-50 last:border-0 ${
                  onRowClick ? 'cursor-pointer transition hover:bg-brand-50/50' : ''
                }`}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={`${pad} text-ink-800 ${align[column.align] || align.left} ${
                      column.className || ''
                    } ${HIDE_BELOW[column.hideBelow] || ''}`}
                  >
                    {column.render ? column.render(row, index) : row[column.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {footer && (
            <tfoot>
              {/*
                One cell spanning every column, with the summary laid out
                inside it. A per-cell colSpan cannot stay aligned once
                responsive columns start hiding at smaller widths.
              */}
              <tr className="border-t-2 border-ink-200 bg-ink-50 font-bold text-ink-900">
                <td colSpan={columns.length} className={pad}>
                  <div className="flex flex-wrap items-center justify-end gap-x-8 gap-y-1">
                    {footer.map((cell, index) => (
                      <span key={index} className="flex items-baseline gap-2.5">
                        {cell.label && (
                          <span className="text-[12px] font-bold uppercase tracking-[0.06em] text-ink-500">
                            {cell.label}
                          </span>
                        )}
                        <span className="tabular">{cell.value ?? cell.content}</span>
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
