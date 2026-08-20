import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAppData } from '../context/AppDataContext'
import reportService from '../services/reportService'
import { PageHeader, StatCard, Badge } from '../components/common/Bits'
import { ErrorState, SkeletonGrid } from '../components/common/States'
import Button from '../components/common/Button'
import { ChartCard, DonutChart, SalesTrendChart, BarSeriesChart } from '../components/reports/Charts'
import {
  IconAlert,
  IconBilling,
  IconCard,
  IconCash,
  IconExpense,
  IconReceipt,
  IconRefresh,
  IconTables,
  IconUpi,
} from '../components/common/Icons'
import { formatMoney, formatNumber } from '../utils/format'

export default function Dashboard() {
  const { currency } = useAppData()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  async function load() {
    setError(null)
    try {
      setData(await reportService.dashboard())
    } catch (caught) {
      setError(caught)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    const timer = setInterval(load, 60000)
    return () => clearInterval(timer)
  }, [])

  if (error) return <ErrorState error={error} onRetry={load} />

  const money = (value) => formatMoney(value, currency)

  return (
    <div>
      <PageHeader
        breadcrumb="Today at a glance"
        title="Dashboard"
        subtitle={
          data
            ? new Date(data.date).toLocaleDateString('en-IN', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })
            : ' '
        }
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
            <Link to="/bills">
              <Button variant="secondary" icon={<IconReceipt className="h-4 w-4" />}>
                Bill history
              </Button>
            </Link>
            <Link to="/billing">
              <Button icon={<IconBilling className="h-4 w-4" />}>Open billing</Button>
            </Link>
          </>
        }
      />

      {/* headline numbers */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Today's sales"
          value={money(data?.todays_sales)}
          hint={data ? `${data.todays_bills} bills · avg ${money(data.average_bill)}` : ''}
          tone="brand"
          loading={loading}
          icon={<IconBilling className="h-4 w-4" />}
        />
        <StatCard
          label="Today's bills"
          value={formatNumber(data?.todays_bills)}
          hint={data ? `${money(data.gst_collected)} GST collected` : ''}
          tone="info"
          loading={loading}
          icon={<IconBilling className="h-4 w-4" />}
        />
        <StatCard
          label="Expenses"
          value={money(data?.todays_expenses)}
          hint={data ? `${money(data.discount_given)} discount given` : ''}
          tone="warning"
          loading={loading}
          icon={<IconExpense className="h-4 w-4" />}
        />
        <StatCard
          label={data?.is_profit === false ? 'Estimated loss' : 'Estimated profit'}
          value={money(data?.estimated_profit)}
          hint="Net revenue (excl. GST) − expenses"
          tone={data?.is_profit === false ? 'danger' : 'success'}
          loading={loading}
          icon={<IconExpense className="h-4 w-4" />}
        />
      </div>

      {/* payment split + floor */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Cash"
          value={money(data?.cash_sales)}
          tone="success"
          loading={loading}
          icon={<IconCash className="h-4 w-4" />}
        />
        <StatCard
          label="Card"
          value={money(data?.card_sales)}
          tone="info"
          loading={loading}
          icon={<IconCard className="h-4 w-4" />}
        />
        <StatCard
          label="UPI"
          value={money(data?.upi_sales)}
          tone="brand"
          loading={loading}
          icon={<IconUpi className="h-4 w-4" />}
        />
        <StatCard
          label="Floor"
          value={data ? `${data.active_tables}/${data.total_tables}` : '—'}
          hint={data ? `${data.pending_bills} bills pending · ${data.open_orders} open orders` : ''}
          tone="saffron"
          loading={loading}
          icon={<IconTables className="h-4 w-4" />}
        />
      </div>

      {loading && !data ? (
        <SkeletonGrid count={2} />
      ) : (
        <>
          <div className="mb-4 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
            <ChartCard title="Last 7 days" subtitle="Net sales per day">
              <SalesTrendChart data={data?.sales_trend || []} currency={currency} />
            </ChartCard>

            <ChartCard title="Payment mix" subtitle="How today was settled">
              <DonutChart
                data={(data?.payment_breakdown || []).map((row) => ({
                  ...row,
                  amount: Number(row.amount),
                }))}
                nameKey="mode"
                valueKey="amount"
                currency={currency}
              />
            </ChartCard>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard
              title="Best sellers today"
              subtitle="By quantity sold"
              action={
                <Link
                  to="/reports"
                  className="text-[13px] font-semibold text-brand-700 hover:underline"
                >
                  Full report →
                </Link>
              }
            >
              {(data?.best_sellers || []).length === 0 ? (
                <p className="py-10 text-center text-sm text-ink-400">
                  No sales recorded yet today.
                </p>
              ) : (
                <BarSeriesChart
                  data={data.best_sellers.map((row) => ({
                    ...row,
                    quantity_sold: Number(row.quantity_sold),
                  }))}
                  xKey="name"
                  yKey="quantity_sold"
                  name="Sold"
                  valueLabel="count"
                  horizontal
                  height={Math.max(180, data.best_sellers.length * 46)}
                />
              )}
            </ChartCard>

            <ChartCard
              title="Kitchen capacity"
              subtitle="Raw materials below their alert threshold"
              action={
                <Link
                  to="/inventory"
                  className="text-[13px] font-semibold text-brand-700 hover:underline"
                >
                  Inventory →
                </Link>
              }
            >
              {(data?.low_stock_alerts || []).length === 0 ? (
                <div className="flex flex-col items-center py-10 text-center">
                  <span className="mb-2 grid h-10 w-10 place-items-center rounded-full bg-emerald-100 text-emerald-700">
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeWidth="2" d="M20 6L9 17l-5-5" />
                    </svg>
                  </span>
                  <p className="text-sm font-semibold text-ink-700">Everything is well stocked</p>
                  <p className="mt-0.5 text-[13px] text-ink-500">
                    No material is below its threshold.
                  </p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {data.low_stock_alerts.map((alert) => (
                    <li
                      key={alert.raw_material_id}
                      className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5"
                    >
                      <IconAlert className="h-5 w-5 shrink-0 text-amber-600" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-amber-900">
                          {alert.raw_material_name}
                        </span>
                        <span className="tabular block text-[13px] text-amber-800">
                          {alert.current_stock} {alert.unit} in stock
                        </span>
                      </span>
                      <Badge tone="warning">
                        {alert.lowest_min_output} {alert.menu_item_name || alert.unit} left
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </ChartCard>
          </div>
        </>
      )}
    </div>
  )
}
