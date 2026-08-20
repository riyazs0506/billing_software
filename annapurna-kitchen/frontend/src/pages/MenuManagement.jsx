import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAppData } from '../context/AppDataContext'
import { useToast } from '../context/ToastContext'
import menuService from '../services/menuService'
import Button from '../components/common/Button'
import Modal from '../components/common/Modal'
import DataTable from '../components/common/DataTable'
import { Input, Select, Textarea, Toggle } from '../components/common/Field'
import { Badge, ConfirmDialog, PageHeader, Tabs } from '../components/common/Bits'
import { EmptyState, ErrorState } from '../components/common/States'
import { IconEdit, IconPlus, IconSearch, IconTrash } from '../components/common/Icons'
import { formatMoney } from '../utils/format'

const BLANK_ITEM = {
  name: '',
  category_id: '',
  price: '',
  description: '',
  is_available: true,
}

export default function MenuManagement() {
  const { currency } = useAppData()
  const toast = useToast()

  const [tab, setTab] = useState('items')
  const [categories, setCategories] = useState([])
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState('')

  const [itemModal, setItemModal] = useState(null) // null | {…item}
  const [categoryModal, setCategoryModal] = useState(null)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [confirm, setConfirm] = useState(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [categoryRows, itemRows] = await Promise.all([
        menuService.categories(),
        menuService.items(),
      ])
      setCategories(categoryRows)
      setItems(itemRows)
    } catch (caught) {
      setError(caught)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const visibleItems = useMemo(() => {
    const term = search.trim().toLowerCase()
    return items.filter((item) => {
      if (filterCategory && String(item.category_id) !== String(filterCategory)) return false
      if (term && !item.name.toLowerCase().includes(term)) return false
      return true
    })
  }, [items, search, filterCategory])

  // --- item CRUD --------------------------------------------------------
  function validateItem(form) {
    const next = {}
    if (!form.name.trim()) next.name = 'Enter the dish name.'
    if (!form.category_id) next.category_id = 'Pick a category.'
    if (form.price === '' || Number(form.price) < 0) next.price = 'Enter a valid price.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  async function saveItem() {
    if (!validateItem(itemModal)) return
    setSaving(true)
    try {
      const payload = {
        name: itemModal.name.trim(),
        category_id: Number(itemModal.category_id),
        price: String(itemModal.price),
        description: itemModal.description?.trim() || '',
        is_available: itemModal.is_available,
      }
      if (itemModal.id) {
        await menuService.updateItem(itemModal.id, payload)
        toast.success(`${payload.name} updated.`)
      } else {
        await menuService.createItem(payload)
        toast.success(`${payload.name} added to the menu.`)
      }
      setItemModal(null)
      load()
    } catch (caught) {
      if (caught.details?.field) setErrors({ [caught.details.field]: caught.message })
      else toast.fromError(caught, 'Could not save that item.')
    } finally {
      setSaving(false)
    }
  }

  async function toggleAvailability(item) {
    // Optimistic: the billing grid respects this immediately.
    setItems((current) =>
      current.map((row) =>
        row.id === item.id ? { ...row, is_available: !row.is_available } : row
      )
    )
    try {
      await menuService.toggleAvailability(item.id, !item.is_available)
    } catch (caught) {
      toast.fromError(caught, 'Could not change availability.')
      load()
    }
  }

  async function removeItem(item) {
    setSaving(true)
    try {
      await menuService.deleteItem(item.id)
      toast.success(`${item.name} removed from the menu.`)
      setConfirm(null)
      load()
    } catch (caught) {
      toast.fromError(caught, 'Could not remove that item.')
    } finally {
      setSaving(false)
    }
  }

  // --- category CRUD ----------------------------------------------------
  async function saveCategory() {
    if (!categoryModal.name.trim()) {
      setErrors({ name: 'Enter a category name.' })
      return
    }
    setSaving(true)
    try {
      const payload = {
        name: categoryModal.name.trim(),
        sort_order: Number(categoryModal.sort_order || 0),
        is_active: categoryModal.is_active ?? true,
      }
      if (categoryModal.id) await menuService.updateCategory(categoryModal.id, payload)
      else await menuService.createCategory(payload)
      toast.success('Category saved.')
      setCategoryModal(null)
      load()
    } catch (caught) {
      toast.fromError(caught, 'Could not save that category.')
    } finally {
      setSaving(false)
    }
  }

  async function removeCategory(category) {
    setSaving(true)
    try {
      await menuService.deleteCategory(category.id)
      toast.success('Category deleted.')
      setConfirm(null)
      load()
    } catch (caught) {
      toast.fromError(caught, 'Could not delete that category.')
      setConfirm(null)
    } finally {
      setSaving(false)
    }
  }

  if (error) return <ErrorState error={error} onRetry={load} />

  const itemColumns = [
    {
      key: 'name',
      header: 'Item',
      render: (row) => (
        <div className="min-w-0">
          <p className="font-semibold text-ink-900">{row.name}</p>
          {row.description && (
            <p className="truncate text-[13px] text-ink-500">{row.description}</p>
          )}
        </div>
      ),
    },
    {
      key: 'category_name',
      header: 'Category',
      hideBelow: 'sm',
      render: (row) => <Badge tone="neutral">{row.category_name}</Badge>,
    },
    {
      key: 'price',
      header: 'Price',
      align: 'right',
      render: (row) => (
        <span className="tabular font-bold">{formatMoney(row.price, currency)}</span>
      ),
    },
    {
      key: 'is_available',
      header: 'Available',
      align: 'center',
      render: (row) => (
        <Toggle checked={row.is_available} onChange={() => toggleAvailability(row)} />
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
              setItemModal({ ...row, price: String(row.price) })
            }}
            aria-label={`Edit ${row.name}`}
            className="rounded-lg p-2 text-ink-500 transition hover:bg-ink-100 hover:text-brand-700"
          >
            <IconEdit className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setConfirm({ kind: 'item', row })}
            aria-label={`Delete ${row.name}`}
            className="rounded-lg p-2 text-ink-500 transition hover:bg-red-50 hover:text-red-600"
          >
            <IconTrash className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ]

  const categoryColumns = [
    { key: 'name', header: 'Category', render: (row) => <span className="font-semibold">{row.name}</span> },
    { key: 'item_count', header: 'Items', align: 'center' },
    { key: 'sort_order', header: 'Order', align: 'center', hideBelow: 'sm' },
    {
      key: 'is_active',
      header: 'Shown on POS',
      align: 'center',
      render: (row) => (
        <Badge tone={row.is_active ? 'success' : 'neutral'}>{row.is_active ? 'Yes' : 'Hidden'}</Badge>
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
              setCategoryModal({ ...row })
            }}
            aria-label={`Edit ${row.name}`}
            className="rounded-lg p-2 text-ink-500 transition hover:bg-ink-100 hover:text-brand-700"
          >
            <IconEdit className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setConfirm({ kind: 'category', row })}
            aria-label={`Delete ${row.name}`}
            className="rounded-lg p-2 text-ink-500 transition hover:bg-red-50 hover:text-red-600"
          >
            <IconTrash className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Menu"
        subtitle="Dishes, prices, categories and availability. Unavailable items are disabled on the billing screen."
        actions={
          tab === 'items' ? (
            <Button
              icon={<IconPlus className="h-4 w-4" />}
              onClick={() => {
                setErrors({})
                setItemModal({ ...BLANK_ITEM, category_id: categories[0]?.id || '' })
              }}
            >
              Add item
            </Button>
          ) : (
            <Button
              icon={<IconPlus className="h-4 w-4" />}
              onClick={() => {
                setErrors({})
                setCategoryModal({ name: '', sort_order: categories.length + 1, is_active: true })
              }}
            >
              Add category
            </Button>
          )
        }
      />

      <Tabs
        className="mb-5"
        active={tab}
        onChange={setTab}
        tabs={[
          { value: 'items', label: 'Items', count: items.length },
          { value: 'categories', label: 'Categories', count: categories.length },
        ]}
      />

      {tab === 'items' ? (
        <>
          <div className="mb-4 flex flex-wrap gap-3">
            <div className="relative min-w-[14rem] flex-1">
              <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search dishes…"
                aria-label="Search dishes"
                className="field pl-9"
              />
            </div>
            <select
              value={filterCategory}
              onChange={(event) => setFilterCategory(event.target.value)}
              aria-label="Filter by category"
              className="field w-auto"
            >
              <option value="">All categories</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          <DataTable
            columns={itemColumns}
            rows={visibleItems}
            loading={loading}
            empty={
              <EmptyState
                title={search || filterCategory ? 'No matching dishes' : 'The menu is empty'}
                description="Add your first dish to start billing."
                action={
                  <Button
                    icon={<IconPlus className="h-4 w-4" />}
                    onClick={() =>
                      setItemModal({ ...BLANK_ITEM, category_id: categories[0]?.id || '' })
                    }
                  >
                    Add item
                  </Button>
                }
              />
            }
          />
        </>
      ) : (
        <DataTable columns={categoryColumns} rows={categories} loading={loading} />
      )}

      {/* --- item modal --- */}
      <Modal
        open={Boolean(itemModal)}
        onClose={() => setItemModal(null)}
        title={itemModal?.id ? 'Edit item' : 'Add item'}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setItemModal(null)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={saveItem} loading={saving}>
              {itemModal?.id ? 'Save changes' : 'Add to menu'}
            </Button>
          </>
        }
      >
        {itemModal && (
          <div className="space-y-4">
            <Input
              data-autofocus
              label="Dish name"
              required
              value={itemModal.name}
              error={errors.name}
              onChange={(event) => setItemModal({ ...itemModal, name: event.target.value })}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                label="Category"
                required
                value={itemModal.category_id}
                error={errors.category_id}
                onChange={(event) =>
                  setItemModal({ ...itemModal, category_id: event.target.value })
                }
                options={categories.map((category) => ({
                  value: category.id,
                  label: category.name,
                }))}
              />
              <Input
                label="Price"
                required
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                prefix={currency}
                value={itemModal.price}
                error={errors.price}
                onChange={(event) => setItemModal({ ...itemModal, price: event.target.value })}
              />
            </div>
            <Textarea
              label="Description"
              value={itemModal.description || ''}
              placeholder="Shown on the item card and the KOT."
              onChange={(event) =>
                setItemModal({ ...itemModal, description: event.target.value })
              }
            />
            <Toggle
              checked={itemModal.is_available}
              onChange={(value) => setItemModal({ ...itemModal, is_available: value })}
              label="Available for ordering"
              description="Switch off to grey it out on the billing screen without deleting it."
            />
          </div>
        )}
      </Modal>

      {/* --- category modal --- */}
      <Modal
        open={Boolean(categoryModal)}
        onClose={() => setCategoryModal(null)}
        title={categoryModal?.id ? 'Edit category' : 'Add category'}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCategoryModal(null)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={saveCategory} loading={saving}>
              Save
            </Button>
          </>
        }
      >
        {categoryModal && (
          <div className="space-y-4">
            <Input
              data-autofocus
              label="Name"
              required
              value={categoryModal.name}
              error={errors.name}
              onChange={(event) =>
                setCategoryModal({ ...categoryModal, name: event.target.value })
              }
            />
            <Input
              label="Sort order"
              type="number"
              min="0"
              value={categoryModal.sort_order}
              hint="Lower numbers appear first on the billing screen."
              onChange={(event) =>
                setCategoryModal({ ...categoryModal, sort_order: event.target.value })
              }
            />
            <Toggle
              checked={categoryModal.is_active ?? true}
              onChange={(value) => setCategoryModal({ ...categoryModal, is_active: value })}
              label="Show on the billing screen"
            />
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.kind === 'item' ? 'Remove this item?' : 'Delete this category?'}
        message={
          confirm?.kind === 'item'
            ? `"${confirm?.row?.name}" will disappear from the menu. Past bills keep it, so history stays intact.`
            : `"${confirm?.row?.name}" can only be deleted once it has no items.`
        }
        confirmLabel="Delete"
        loading={saving}
        onConfirm={() =>
          confirm.kind === 'item' ? removeItem(confirm.row) : removeCategory(confirm.row)
        }
        onCancel={() => setConfirm(null)}
      />
    </div>
  )
}
