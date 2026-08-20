import { useMemo, useState } from 'react'
import Modal from '../common/Modal'
import Button from '../common/Button'
import { formatMoney } from '../../utils/format'
import { IconPlus, IconTrash } from '../common/Icons'

/**
 * Split one table order into several bills for separate payments.
 * Each group becomes its own pending invoice on the server.
 */
export default function SplitBillModal({ open, onClose, order, currency = '₹', onSplit, busy }) {
  const lines = useMemo(
    () => (order?.items || []).filter((line) => !line.bill_id),
    [order]
  )
  const [groups, setGroups] = useState([[], []])
  const [error, setError] = useState(null)

  const assigned = useMemo(() => new Map(
    groups.flatMap((group, index) => group.map((id) => [id, index]))
  ), [groups])

  function assign(lineId, groupIndex) {
    setError(null)
    setGroups((current) =>
      current.map((group, index) => {
        const without = group.filter((id) => id !== lineId)
        return index === groupIndex ? [...without, lineId] : without
      })
    )
  }

  function unassign(lineId) {
    setError(null)
    setGroups((current) => current.map((group) => group.filter((id) => id !== lineId)))
  }

  function groupTotal(group) {
    return group.reduce((sum, id) => {
      const line = lines.find((candidate) => candidate.id === id)
      return sum + Number(line?.line_total || 0)
    }, 0)
  }

  function submit() {
    const filled = groups.filter((group) => group.length > 0)
    if (filled.length < 2) {
      setError('Put items into at least two bills to split.')
      return
    }
    const unassignedLines = lines.filter((line) => !assigned.has(line.id))
    if (unassignedLines.length) {
      setError(
        `${unassignedLines.length} item(s) are not assigned yet. Every item must belong to a bill.`
      )
      return
    }
    onSplit(filled.map((group) => ({ order_item_ids: group })))
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Split this table"
      subtitle="Assign each item to a bill; every bill is paid separately."
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} loading={busy}>
            Create {groups.filter((group) => group.length).length} bills
          </Button>
        </>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        {/* unassigned pool */}
        <div>
          <p className="section-title mb-2">Items ({lines.length})</p>
          <ul className="space-y-1.5">
            {lines.map((line) => {
              const target = assigned.get(line.id)
              return (
                <li
                  key={line.id}
                  className={`rounded-lg border px-3 py-2.5 transition ${
                    target != null ? 'border-ink-200 bg-ink-50' : 'border-ink-200 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink-900">
                        {line.quantity} × {line.name}
                      </p>
                      <p className="tabular text-[13px] text-ink-500">
                        {formatMoney(line.line_total, currency)}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      {groups.map((_, index) => (
                        <button
                          key={index}
                          type="button"
                          onClick={() => assign(line.id, index)}
                          className={`h-8 w-8 rounded-lg text-[13px] font-bold transition ${
                            target === index
                              ? 'bg-brand-700 text-white'
                              : 'bg-ink-100 text-ink-600 hover:bg-brand-100'
                          }`}
                          aria-label={`Move ${line.name} to bill ${index + 1}`}
                        >
                          {index + 1}
                        </button>
                      ))}
                      {target != null && (
                        <button
                          type="button"
                          onClick={() => unassign(line.id)}
                          className="h-8 w-8 rounded-lg text-ink-400 transition hover:bg-red-50 hover:text-red-600"
                          aria-label={`Unassign ${line.name}`}
                        >
                          <IconTrash className="mx-auto h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>

        {/* groups */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="section-title">Bills</p>
            {groups.length < 6 && (
              <Button
                variant="ghost"
                size="sm"
                icon={<IconPlus className="h-4 w-4" />}
                onClick={() => setGroups((current) => [...current, []])}
              >
                Add bill
              </Button>
            )}
          </div>
          <div className="space-y-3">
            {groups.map((group, index) => (
              <div key={index} className="rounded-xl border border-ink-200 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm font-bold text-ink-800">
                    <span className="grid h-6 w-6 place-items-center rounded-full bg-brand-700 text-[12px] text-white">
                      {index + 1}
                    </span>
                    Bill {index + 1}
                  </span>
                  <span className="tabular text-sm font-bold text-ink-900">
                    {formatMoney(groupTotal(group), currency)}
                    <span className="ml-1 text-[12px] font-normal text-ink-400">+ GST</span>
                  </span>
                </div>
                {group.length === 0 ? (
                  <p className="py-3 text-center text-[13px] text-ink-400">
                    Tap {index + 1} on an item to add it here.
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {group.map((id) => {
                      const line = lines.find((candidate) => candidate.id === id)
                      if (!line) return null
                      return (
                        <li
                          key={id}
                          className="flex items-center justify-between gap-2 text-[13px] text-ink-700"
                        >
                          <span className="truncate">
                            {line.quantity} × {line.name}
                          </span>
                          <span className="tabular shrink-0 font-semibold">
                            {formatMoney(line.line_total, currency)}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                )}
                {groups.length > 2 && group.length === 0 && (
                  <button
                    type="button"
                    onClick={() => setGroups((current) => current.filter((_, i) => i !== index))}
                    className="mt-2 text-[12px] font-semibold text-ink-400 hover:text-red-600"
                  >
                    Remove this bill
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-[13px] font-medium text-red-800"
        >
          {error}
        </p>
      )}
    </Modal>
  )
}
