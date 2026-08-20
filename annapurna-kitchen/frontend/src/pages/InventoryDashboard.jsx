import { useCallback, useEffect, useState } from 'react'
import { useAppData } from '../context/AppDataContext'
import { useToast } from '../context/ToastContext'
import inventoryService from '../services/inventoryService'
import menuService from '../services/menuService'
import Button from '../components/common/Button'
import Modal from '../components/common/Modal'
import DataTable from '../components/common/DataTable'
import { Input, Select, Toggle } from '../components/common/Field'
import { ConfirmDialog, PageHeader, StatCard, Tabs } from '../components/common/Bits'
import { EmptyState, ErrorState, SkeletonGrid } from '../components/common/States'
import YieldCard from '../components/inventory/YieldCard'
import { LowStockBanner } from '../components/layout/AppShell'
import { IconAlert, IconInventory, IconPlus, IconRefresh, IconTrash } from '../components/common/Icons'
import { formatDateTime, trimDecimals } from '../utils/format'

const UNITS = [
  { value: 'kg', label: 'kg' },
  { value: 'litre', label: 'litre' },
  { value: 'unit', label: 'unit' },
]

export default function InventoryDashboard() {
  const { reloadAlerts } = useAppData()
  const toast = useToast()

  const [tab, setTab] = useState('cards')
  const [materials, setMaterials] = useState([])
  const [menuItems, setMenuItems] = useState([])
  const [yields, setYields] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const [stockModal, setStockModal] = useState(null)
  const [materialModal, setMaterialModal] = useState(null)
  const [yieldModal, setYieldModal] = useState(null)
  const [movementsFor, setMovementsFor] = useState(null)
  const [movements, setMovements] = useState([])
  const [confirm, setConfirm] = useState(null)
  const [errors, setErrors] = useState({})
  const [preview, setPreview] = useState(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [dashboard, items, yieldRows] = await Promise.all([
        inventoryService.dashboard(),
        menuService.items(),
        inventoryService.yields(),
      ])
      setMaterials(dashboard.materials)
      setMenuItems(items)
      setYields(yieldRows)
    } catch (caught) {
      setError(caught)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Live preview of Output = Stock × Yield while the admin types.
  useEffect(() => {
    if (!yieldModal?.min_yield_per_unit || !yieldModal?.max_yield_per_unit) {
      setPreview(null)
      return
    }
    const material = materials.find(
      (row) => String(row.id) === String(yieldModal.raw_material_id)
    )
    if (!material) {
      setPreview(null)
      return
    }
    const stock = Number(material.current_stock)
    setPreview({
      unit: material.unit,
      stock: trimDecimals(material.current_stock),
      min: Math.floor(stock * Number(yieldModal.min_yield_per_unit || 0)),
      max: Math.floor(stock * Number(yieldModal.max_yield_per_unit || 0)),
    })
  }, [yieldModal, materials])

  // --- stock ------------------------------------------------------------
  async function saveStock() {
    if (stockModal.current_stock === '' || Number(stockModal.current_stock) < 0) {
      setErrors({ current_stock: 'Enter a stock quantity of zero or more.' })
      return
    }
    setSaving(true)
    try {
      await inventoryService.updateStock(
        stockModal.id,
        String(stockModal.current_stock),
        stockModal.note || 'Daily stock entry'
      )
      toast.success(`${stockModal.name} stock updated.`)
      setStockModal(null)
      reloadAlerts()
      load()
    } catch (caught) {
      toast.fromError(caught, 'Could not update stock.')
    } finally {
      setSaving(false)
    }
  }

  // --- material ---------------------------------------------------------
  async function saveMaterial() {
    const next = {}
    if (!materialModal.name?.trim()) next.name = 'Enter a material name.'
    if (!materialModal.unit) next.unit = 'Pick a unit.'
    setErrors(next)
    if (Object.keys(next).length) return

    setSaving(true)
    try {
      const payload = {
        name: materialModal.name.trim(),
        unit: materialModal.unit,
        low_stock_threshold: String(materialModal.low_stock_threshold ?? 20),
        is_active: materialModal.is_active ?? true,
      }
      if (materialModal.id) {
        await inventoryService.updateMaterial(materialModal.id, payload)
      } else {
        await inventoryService.createMaterial({
          ...payload,
          current_stock: String(materialModal.current_stock || 0),
        })
      }
      toast.success('Raw material saved.')
      setMaterialModal(null)
      reloadAlerts()
      load()
    } catch (caught) {
      toast.fromError(caught, 'Could not save that material.')
    } finally {
      setSaving(false)
    }
  }

  async function removeMaterial(material) {
    setSaving(true)
    try {
      await inventoryService.deleteMaterial(material.id)
      toast.success('Raw material deleted.')
      setConfirm(null)
      load()
    } catch (caught) {
      toast.fromError(caught, 'Could not delete that material.')
      setConfirm(null)
    } finally {
      setSaving(false)
    }
  }

  // --- yield ------------------------------------------------------------
  async function saveYield() {
    const next = {}
    if (!yieldModal.menu_item_id) next.menu_item_id = 'Pick a dish.'
    if (!yieldModal.raw_material_id) next.raw_material_id = 'Pick a raw material.'
    if (!yieldModal.min_yield_per_unit) next.min_yield_per_unit = 'Required.'
    if (!yieldModal.max_yield_per_unit) next.max_yield_per_unit = 'Required.'
    if (
      yieldModal.min_yield_per_unit &&
      yieldModal.max_yield_per_unit &&
      Number(yieldModal.max_yield_per_unit) < Number(yieldModal.min_yield_per_unit)
    ) {
      next.max_yield_per_unit = 'Maximum cannot be below the minimum.'
    }
    if (!yieldModal.avg_consumption_per_dish) next.avg_consumption_per_dish = 'Required.'
    setErrors(next)
    if (Object.keys(next).length) return

    setSaving(true)
    try {
      const payload = {
        menu_item_id: Number(yieldModal.menu_item_id),
        raw_material_id: Number(yieldModal.raw_material_id),
        min_yield_per_unit: String(yieldModal.min_yield_per_unit),
        max_yield_per_unit: String(yieldModal.max_yield_per_unit),
        avg_consumption_per_dish: String(yieldModal.avg_consumption_per_dish),
      }
      if (yieldModal.id) await inventoryService.updateYield(yieldModal.id, payload)
      else await inventoryService.createYield(payload)
      toast.success('Yield configuration saved.')
      setYieldModal(null)
      reloadAlerts()
      load()
    } catch (caught) {
      toast.fromError(caught, 'Could not save that yield configuration.')
    } finally {
      setSaving(false)
    }
  }

  async function removeYield(row) {
    setSaving(true)
    try {
      await inventoryService.deleteYield(row.id)
      toast.success('Yield link removed.')
      setConfirm(null)
      load()
    } catch (caught) {
      toast.fromError(caught, 'Could not remove that link.')
    } finally {
      setSaving(false)
    }
  }

  async function openMovements(material) {
    setMovementsFor(material)
    try {
      setMovements(await inventoryService.movements(material.id, { limit: 40 }))
    } catch (caught) {
      toast.fromError(caught, 'Could not load stock history.')
    }
  }

  if (error) return <ErrorState error={error} onRetry={load} />

  const lowCount = materials.filter((row) => row.is_low_stock).length

  return (
    <div>
      <PageHeader
        title="Inventory"
        subtitle="Daily stock and yield-based production capacity. Stock is deducted automatically as dishes are billed."
        actions={
          <>
            <Button
              variant="secondary"
              icon={<IconRefresh className="h-4 w-4" />}
              onClick={load}
              disabled={loading}
            >
              Refresh
            </Button>
            <Button
              icon={<IconPlus className="h-4 w-4" />}
              onClick={() => {
                setErrors({})
                setMaterialModal({
                  name: '',
                  unit: 'kg',
                  current_stock: '',
                  low_stock_threshold: 20,
                  is_active: true,
                })
              }}
            >
              Add material
            </Button>
          </>
        }
      />

      <LowStockBanner className="mb-5" />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Raw materials"
          value={materials.length}
          tone="brand"
          loading={loading}
          icon={<IconInventory className="h-4 w-4" />}
        />
        <StatCard
          label="Low stock"
          value={lowCount}
          hint={lowCount ? 'Below the configured alert threshold' : 'All within threshold'}
          tone={lowCount ? 'danger' : 'success'}
          loading={loading}
          icon={<IconAlert className="h-4 w-4" />}
        />
        <StatCard
          label="Yield links"
          value={yields.length}
          hint="Dish ↔ raw material recipes"
          tone="info"
          loading={loading}
        />
        <StatCard
          label="Dishes covered"
          value={new Set(yields.map((row) => row.menu_item_id)).size}
          hint={`of ${menuItems.length} on the menu`}
          tone="saffron"
          loading={loading}
        />
      </div>

      <Tabs
        className="mb-5"
        active={tab}
        onChange={setTab}
        tabs={[
          { value: 'cards', label: 'Live capacity', count: materials.length },
          { value: 'yields', label: 'Yield configuration', count: yields.length },
        ]}
      />

      {tab === 'cards' ? (
        loading ? (
          <SkeletonGrid count={6} />
        ) : materials.length === 0 ? (
          <div className="card">
            <EmptyState
              title="No raw materials yet"
              description="Add wheat flour, rice, chicken and so on, then link them to dishes."
            />
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {materials.map((material) => (
              <YieldCard
                key={material.id}
                material={material}
                onUpdateStock={(row) => {
                  setErrors({})
                  setStockModal({ ...row, current_stock: trimDecimals(row.current_stock), note: '' })
                }}
                onEdit={(row) => {
                  setErrors({})
                  setMaterialModal({
                    ...row,
                    low_stock_threshold: trimDecimals(row.low_stock_threshold),
                  })
                }}
                onLinkRecipe={(row) => {
                  setErrors({})
                  setYieldModal({
                    raw_material_id: row.id,
                    menu_item_id: '',
                    min_yield_per_unit: '',
                    max_yield_per_unit: '',
                    avg_consumption_per_dish: '',
                  })
                }}
              />
            ))}
          </div>
        )
      ) : (
        <>
          <div className="mb-3 flex justify-end">
            <Button
              variant="secondary"
              icon={<IconPlus className="h-4 w-4" />}
              onClick={() => {
                setErrors({})
                setYieldModal({
                  raw_material_id: materials[0]?.id || '',
                  menu_item_id: '',
                  min_yield_per_unit: '',
                  max_yield_per_unit: '',
                  avg_consumption_per_dish: '',
                })
              }}
            >
              Link a dish
            </Button>
          </div>
          <DataTable
            loading={loading}
            rows={yields}
            columns={[
              {
                key: 'menu_item_name',
                header: 'Dish',
                render: (row) => <span className="font-semibold">{row.menu_item_name}</span>,
              },
              { key: 'raw_material_name', header: 'Raw material' },
              {
                key: 'yield',
                header: 'Yield per unit',
                align: 'center',
                render: (row) => (
                  <span className="tabular">
                    {trimDecimals(row.min_yield_per_unit)}–{trimDecimals(row.max_yield_per_unit)}{' '}
                    <span className="text-ink-400">/ {row.unit}</span>
                  </span>
                ),
              },
              {
                key: 'avg_consumption_per_dish',
                header: 'Used per dish',
                align: 'right',
                render: (row) => (
                  <span className="tabular">
                    {trimDecimals(row.avg_consumption_per_dish)} {row.unit}
                  </span>
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
                        setYieldModal({
                          ...row,
                          min_yield_per_unit: trimDecimals(row.min_yield_per_unit),
                          max_yield_per_unit: trimDecimals(row.max_yield_per_unit),
                          avg_consumption_per_dish: trimDecimals(row.avg_consumption_per_dish),
                        })
                      }}
                      className="rounded-lg px-2 py-1 text-[13px] font-semibold text-brand-700 hover:bg-brand-50"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirm({ kind: 'yield', row })}
                      aria-label="Remove link"
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
                title="No yield configured"
                description="Link a dish to a raw material with its min/max yield so the system can show production capacity and deduct stock."
              />
            }
          />
        </>
      )}

      {/* --- stock entry modal --- */}
      <Modal
        open={Boolean(stockModal)}
        onClose={() => setStockModal(null)}
        title={`Update stock — ${stockModal?.name || ''}`}
        subtitle="This is the absolute quantity on hand right now."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setStockModal(null)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={saveStock} loading={saving}>
              Save stock
            </Button>
          </>
        }
      >
        {stockModal && (
          <div className="space-y-4">
            <Input
              data-autofocus
              label={`Stock on hand (${stockModal.unit})`}
              type="number"
              inputMode="decimal"
              step="0.001"
              min="0"
              required
              value={stockModal.current_stock}
              error={errors.current_stock}
              onChange={(event) =>
                setStockModal({ ...stockModal, current_stock: event.target.value })
              }
            />
            <Input
              label="Note"
              placeholder="Morning delivery, stock take…"
              value={stockModal.note}
              onChange={(event) => setStockModal({ ...stockModal, note: event.target.value })}
            />
            {(stockModal.linked_items || []).length > 0 && (
              <div className="rounded-lg bg-ink-50 px-3 py-2.5">
                <p className="mb-1.5 text-[12px] font-bold uppercase tracking-wide text-ink-500">
                  That would allow
                </p>
                <ul className="space-y-1">
                  {stockModal.linked_items.map((link) => {
                    const stock = Number(stockModal.current_stock || 0)
                    return (
                      <li key={link.menu_item_id} className="tabular text-[13px] text-ink-700">
                        {link.menu_item_name}:{' '}
                        <strong>
                          {Math.floor(stock * Number(link.min_yield_per_unit))}–
                          {Math.floor(stock * Number(link.max_yield_per_unit))}
                        </strong>{' '}
                        servings
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
            <button
              type="button"
              onClick={() => {
                setStockModal(null)
                openMovements(stockModal)
              }}
              className="text-[13px] font-semibold text-brand-700 hover:underline"
            >
              View stock history →
            </button>
          </div>
        )}
      </Modal>

      {/* --- material modal --- */}
      <Modal
        open={Boolean(materialModal)}
        onClose={() => setMaterialModal(null)}
        title={materialModal?.id ? 'Edit raw material' : 'Add raw material'}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setMaterialModal(null)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={saveMaterial} loading={saving}>
              Save
            </Button>
          </>
        }
      >
        {materialModal && (
          <div className="space-y-4">
            <Input
              data-autofocus
              label="Name"
              required
              placeholder="Wheat flour"
              value={materialModal.name}
              error={errors.name}
              onChange={(event) =>
                setMaterialModal({ ...materialModal, name: event.target.value })
              }
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                label="Unit"
                required
                value={materialModal.unit}
                error={errors.unit}
                options={UNITS}
                onChange={(event) =>
                  setMaterialModal({ ...materialModal, unit: event.target.value })
                }
              />
              {!materialModal.id && (
                <Input
                  label="Opening stock"
                  type="number"
                  step="0.001"
                  min="0"
                  value={materialModal.current_stock}
                  onChange={(event) =>
                    setMaterialModal({ ...materialModal, current_stock: event.target.value })
                  }
                />
              )}
            </div>
            <Input
              label="Low-stock threshold"
              type="number"
              step="0.01"
              min="0"
              value={materialModal.low_stock_threshold}
              hint="Alert when the minimum possible output of any linked dish drops below this many servings."
              onChange={(event) =>
                setMaterialModal({ ...materialModal, low_stock_threshold: event.target.value })
              }
            />
            <Toggle
              checked={materialModal.is_active ?? true}
              onChange={(value) => setMaterialModal({ ...materialModal, is_active: value })}
              label="Active"
            />
            {materialModal.id && (
              <button
                type="button"
                onClick={() => setConfirm({ kind: 'material', row: materialModal })}
                className="flex items-center gap-1.5 text-[13px] font-semibold text-red-600 hover:underline"
              >
                <IconTrash className="h-4 w-4" />
                Delete this material
              </button>
            )}
          </div>
        )}
      </Modal>

      {/* --- yield modal --- */}
      <Modal
        open={Boolean(yieldModal)}
        onClose={() => setYieldModal(null)}
        title={yieldModal?.id ? 'Edit yield' : 'Link a dish to a raw material'}
        subtitle="Output = Stock quantity × Yield per unit"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setYieldModal(null)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={saveYield} loading={saving}>
              Save yield
            </Button>
          </>
        }
      >
        {yieldModal && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                label="Dish"
                required
                value={yieldModal.menu_item_id}
                error={errors.menu_item_id}
                onChange={(event) =>
                  setYieldModal({ ...yieldModal, menu_item_id: event.target.value })
                }
              >
                <option value="">Select a dish…</option>
                {menuItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </Select>
              <Select
                label="Raw material"
                required
                value={yieldModal.raw_material_id}
                error={errors.raw_material_id}
                onChange={(event) =>
                  setYieldModal({ ...yieldModal, raw_material_id: event.target.value })
                }
              >
                <option value="">Select a material…</option>
                {materials.map((material) => (
                  <option key={material.id} value={material.id}>
                    {material.name} ({material.unit})
                  </option>
                ))}
              </Select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Minimum yield per unit"
                required
                type="number"
                step="0.01"
                min="0"
                placeholder="12"
                value={yieldModal.min_yield_per_unit}
                error={errors.min_yield_per_unit}
                onChange={(event) =>
                  setYieldModal({ ...yieldModal, min_yield_per_unit: event.target.value })
                }
              />
              <Input
                label="Maximum yield per unit"
                required
                type="number"
                step="0.01"
                min="0"
                placeholder="16"
                value={yieldModal.max_yield_per_unit}
                error={errors.max_yield_per_unit}
                onChange={(event) =>
                  setYieldModal({ ...yieldModal, max_yield_per_unit: event.target.value })
                }
              />
            </div>

            <Input
              label="Average consumption per dish"
              required
              type="number"
              step="0.001"
              min="0"
              placeholder="0.075"
              value={yieldModal.avg_consumption_per_dish}
              error={errors.avg_consumption_per_dish}
              hint="How much of the material one serving uses. This is what gets deducted when the dish is billed."
              onChange={(event) =>
                setYieldModal({ ...yieldModal, avg_consumption_per_dish: event.target.value })
              }
            />

            {preview && (
              <div className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3">
                <p className="text-[12px] font-bold uppercase tracking-wide text-brand-700">
                  With today&apos;s stock
                </p>
                <p className="tabular mt-1 font-display text-xl font-bold text-brand-900">
                  {preview.stock} {preview.unit} → {preview.min}–{preview.max} servings
                </p>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* --- movements --- */}
      <Modal
        open={Boolean(movementsFor)}
        onClose={() => setMovementsFor(null)}
        title={`Stock history — ${movementsFor?.name || ''}`}
        size="lg"
      >
        {movements.length === 0 ? (
          <EmptyState title="No movements recorded" />
        ) : (
          <ul className="divide-y divide-ink-100">
            {movements.map((movement) => (
              <li key={movement.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink-900">
                    {movement.reason === 'billing_deduction' ? 'Sold' : 'Stock entry'}
                    {movement.bill_id && (
                      <span className="ml-1.5 text-[12px] font-normal text-ink-400">
                        bill #{movement.bill_id}
                      </span>
                    )}
                  </p>
                  <p className="text-[13px] text-ink-500">
                    {formatDateTime(movement.created_at)}
                    {movement.note ? ` · ${movement.note}` : ''}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p
                    className={`tabular text-sm font-bold ${
                      Number(movement.change_qty) < 0 ? 'text-red-600' : 'text-emerald-700'
                    }`}
                  >
                    {Number(movement.change_qty) > 0 ? '+' : ''}
                    {trimDecimals(movement.change_qty)}
                  </p>
                  <p className="tabular text-[12px] text-ink-400">
                    → {trimDecimals(movement.balance_after)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.kind === 'yield' ? 'Remove this yield link?' : 'Delete this material?'}
        message={
          confirm?.kind === 'yield'
            ? 'The dish will stop deducting this raw material when billed.'
            : `"${confirm?.row?.name}" can only be deleted once no recipe uses it.`
        }
        confirmLabel="Delete"
        loading={saving}
        onConfirm={() =>
          confirm.kind === 'yield' ? removeYield(confirm.row) : removeMaterial(confirm.row)
        }
        onCancel={() => setConfirm(null)}
      />
    </div>
  )
}
