import { useCallback, useEffect, useState } from 'react'
import { useAppData } from '../context/AppDataContext'
import { useToast } from '../context/ToastContext'
import reportService from '../services/reportService'
import Button from '../components/common/Button'
import DataTable from '../components/common/DataTable'
import { Badge, DateRangeBar, PageHeader, StatCard, Tabs } from '../components/common/Bits'
import { EmptyState, ErrorState, SkeletonTable } from '../components/common/States'
import {
  BarSeriesChart,
  ChartCard,
  DonutChart,
  SalesTrendChart,
} from '../components/reports/Charts'
import { IconDownload } from '../components/common/Icons'
import { daysAgoIso, formatDate, formatMoney, formatNumber, todayIso } from '../utils/format'

const TABS = [
  { value: 'daily', label: 'Daily' },
  { value: 'item-wise', label: 'Item-wise' },
  { value: 'staff-wise', label: 'Staff-wise' },
  { value: 'expenses', label: 'Expenses' },
  { value: 'profit-loss', label: 'Profit & Loss' },
]

export default function Reports() {
  const { currency } = useAppData()
  const toast = useToast()

  const [tab, setTab] = useState('daily')
  const [start, setStart] = useState(daysAgoIso(6))
  const [end, setEnd] = useState(todayIso())
  const [presets, setPresets] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [exporting, setExporting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setSummary(await reportService.summary(start, end))
    } catch (caught) {
      setError(caught)
    } finally {
      setLoading(false)
    }
  }, [start, end])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    reportService
      .quickRanges()
      .then(setPresets)
      .catch(() => setPresets([]))
  }, [])

  async function exportReport(format) {
    setExporting(true)
    try {
      const filename = await reportService.export(tab, format, start, end)
      toast.success(`Downloaded ${filename}.`)
    } catch (caught) {
      toast.fromError(caught, 'Export failed.')
    } finally {
      setExporting(false)
    }
  }

  async function exportAll() {
    setExporting(true)
    try {
      const filename = await reportService.export('all', 'xlsx', start, end)
      toast.success(`Downloaded ${filename} with every sheet.`)
    } catch (caught) {
      toast.fromError(caught, 'Export failed.')
    } finally {
      setExporting(false)
    }
  }

  if (error) return <ErrorState error={error} onRetry={load} />

  const money = (value) => formatMoney(value, currency)

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle="Sales, items, staff attribution, expenses and profitability for any date range."
        actions={
          <Button
            variant="secondary"
            icon={<IconDownload className="h-4 w-4" />}
            onClick={exportAll}
            loading={exporting}
          >
            Export everything (Excel)
          </Button>
        }
      />

      <DateRangeBar
        start={start}
        end={end}
        onChange={(nextStart, nextEnd) => {
          setStart(nextStart)
          setEnd(nextEnd)
        }}
        presets={presets}
        right={
          <>
            <Button
              variant="secondary"
              size="sm"
              icon={<IconDownload className="h-4 w-4" />}
              onClick={() => exportReport('csv')}
              loading={exporting}
            >
              CSV
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<IconDownload className="h-4 w-4" />}
              onClick={() => exportReport('xlsx')}
              loading={exporting}
            >
              Excel
            </Button>
          </>
        }
      />

      <Tabs className="mb-5" active={tab} onChange={setTab} tabs={TABS} />

      {loading ? (
        <SkeletonTable rows={8} />
      ) : (
        <>
          {tab === 'daily' && <DailyReport data={summary.daily} money={money} currency={currency} />}
          {tab === 'item-wise' && <ItemReport data={summary.item_wise} money={money} />}
          {tab === 'staff-wise' && (
            <StaffReport data={summary.staff_wise} money={money} currency={currency} />
          )}
          {tab === 'expenses' && (
            <ExpenseReport data={summary.expenses} money={money} currency={currency} />
          )}
          {tab === 'profit-loss' && <ProfitLoss data={summary.profit_loss} money={money} />}
        </>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ daily */

function DailyReport({ data, money, currency }) {
  const s = data.summary
  return (
    <div>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Net sales" value={money(s.net_sales)} tone="brand" />
        <StatCard label="Bills" value={formatNumber(s.bill_count)} tone="info" />
        <StatCard label="Average bill" value={money(s.average_bill)} tone="neutral" />
        <StatCard label="Discount given" value={money(s.discount_total)} tone="success" />
        <StatCard
          label="GST collected"
          value={money(s.gst_total)}
          hint={`CGST ${money(s.cgst_total)} · SGST ${money(s.sgst_total)}`}
          tone="warning"
        />
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <ChartCard title="Sales by day">
          {data.by_day.length === 0 ? (
            <EmptyState title="No sales in this range" />
          ) : (
            <SalesTrendChart
              data={data.by_day.map((row) => ({ ...row, label: formatDate(row.date) }))}
              currency={currency}
            />
          )}
        </ChartCard>
        <ChartCard title="Payment modes">
          <DonutChart
            data={data.by_payment_mode.map((row) => ({ ...row, amount: Number(row.amount) }))}
            nameKey="mode"
            valueKey="amount"
            currency={currency}
          />
        </ChartCard>
      </div>

      <DataTable
        rows={data.by_day}
        columns={[
          { key: 'date', header: 'Date', render: (row) => formatDate(row.date) },
          { key: 'bill_count', header: 'Bills', align: 'center' },
          {
            key: 'discount',
            header: 'Discount',
            align: 'right',
            render: (row) => <span className="tabular">{money(row.discount)}</span>,
          },
          {
            key: 'cgst',
            header: 'CGST',
            align: 'right',
            hideBelow: 'sm',
            render: (row) => <span className="tabular">{money(row.cgst)}</span>,
          },
          {
            key: 'sgst',
            header: 'SGST',
            align: 'right',
            hideBelow: 'sm',
            render: (row) => <span className="tabular">{money(row.sgst)}</span>,
          },
          {
            key: 'total',
            header: 'Total',
            align: 'right',
            render: (row) => <span className="tabular font-bold">{money(row.total)}</span>,
          },
        ]}
        footer={[{ label: 'Total sales', value: money(data.summary.net_sales) }]}
        empty={<EmptyState title="No sales in this range" />}
      />
    </div>
  )
}

/* -------------------------------------------------------------- item-wise */

function ItemReport({ data, money }) {
  return (
    <div>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Items sold" value={formatNumber(data.total_quantity)} tone="brand" />
        <StatCard label="Revenue" value={money(data.total_revenue)} tone="success" />
        <StatCard
          label="Best seller"
          value={data.best_sellers[0]?.name || '—'}
          hint={
            data.best_sellers[0]
              ? `${data.best_sellers[0].quantity_sold} sold`
              : 'No sales in this range'
          }
          tone="saffron"
        />
        <StatCard label="Distinct dishes" value={data.items.length} tone="info" />
      </div>

      {data.items.length > 0 && (
        <ChartCard title="Top sellers" subtitle="By quantity" className="mb-4">
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
        </ChartCard>
      )}

      <DataTable
        rows={data.items}
        columns={[
          {
            key: 'name',
            header: 'Item',
            render: (row, index) => (
              <span className="flex items-center gap-2">
                <span className="tabular w-6 text-[13px] text-ink-400">{index + 1}</span>
                <span className="font-semibold text-ink-900">{row.name}</span>
              </span>
            ),
          },
          {
            key: 'quantity_sold',
            header: 'Qty sold',
            align: 'center',
            render: (row) => <span className="tabular font-semibold">{row.quantity_sold}</span>,
          },
          {
            key: 'revenue',
            header: 'Revenue',
            align: 'right',
            render: (row) => <span className="tabular font-bold">{money(row.revenue)}</span>,
          },
          {
            key: 'share',
            header: 'Share',
            align: 'right',
            hideBelow: 'sm',
            render: (row) => {
              const share = Number(data.total_revenue)
                ? (Number(row.revenue) / Number(data.total_revenue)) * 100
                : 0
              return <span className="tabular text-ink-500">{share.toFixed(1)}%</span>
            },
          },
        ]}
        footer={[
          { label: 'Qty sold', value: formatNumber(data.total_quantity) },
          { label: 'Revenue', value: money(data.total_revenue) },
        ]}
        empty={<EmptyState title="Nothing sold in this range" />}
      />
    </div>
  )
}

/* ------------------------------------------------------------- staff-wise */

function StaffReport({ data, money, currency }) {
  return (
    <div>
      <p className="mb-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-[13px] text-sky-900">
        Sales are attributed to the account that was signed in when each bill was created. This
        report reads transaction data only — user accounts are provisioned during setup and are
        not managed from the application.
      </p>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Total sales" value={money(data.total_sales)} tone="brand" />
        <StatCard label="Accounts with sales" value={data.staff.length} tone="info" />
        <StatCard
          label="Top performer"
          value={data.staff[0]?.name || '—'}
          hint={data.staff[0] ? `${money(data.staff[0].total_sales)} in this range` : ''}
          tone="saffron"
        />
      </div>

      {data.staff.length > 0 && (
        <ChartCard title="Sales by user" className="mb-4">
          <BarSeriesChart
            data={data.staff.map((row) => ({ ...row, total_sales: Number(row.total_sales) }))}
            xKey="name"
            yKey="total_sales"
            name="Sales"
            currency={currency}
            horizontal
            height={Math.max(160, data.staff.length * 52)}
          />
        </ChartCard>
      )}

      <DataTable
        rows={data.staff}
        columns={[
          {
            key: 'name',
            header: 'User',
            render: (row) => (
              <div>
                <p className="font-semibold text-ink-900">{row.name}</p>
                <p className="text-[13px] text-ink-500">{row.username}</p>
              </div>
            ),
          },
          {
            key: 'role',
            header: 'Role',
            align: 'center',
            render: (row) => (
              <Badge tone={row.role === 'admin' ? 'brand' : 'neutral'}>{row.role}</Badge>
            ),
          },
          {
            key: 'bill_count',
            header: 'Bills',
            align: 'center',
            render: (row) => <span className="tabular">{row.bill_count}</span>,
          },
          {
            key: 'average_bill',
            header: 'Average bill',
            align: 'right',
            hideBelow: 'sm',
            render: (row) => <span className="tabular">{money(row.average_bill)}</span>,
          },
          {
            key: 'discount_given',
            header: 'Discount',
            align: 'right',
            hideBelow: 'md',
            render: (row) => <span className="tabular">{money(row.discount_given)}</span>,
          },
          {
            key: 'total_sales',
            header: 'Total sales',
            align: 'right',
            render: (row) => <span className="tabular font-bold">{money(row.total_sales)}</span>,
          },
        ]}
        footer={[{ label: 'Total sales', value: money(data.total_sales) }]}
        empty={<EmptyState title="No bills in this range" />}
      />
    </div>
  )
}

/* ---------------------------------------------------------------- expenses */

function ExpenseReport({ data, money, currency }) {
  return (
    <div>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Total expenses" value={money(data.total)} tone="warning" />
        <StatCard label="Entries" value={data.count} tone="neutral" />
        <StatCard
          label="Largest category"
          value={data.by_category[0]?.category || '—'}
          hint={data.by_category[0] ? money(data.by_category[0].amount) : ''}
          tone="danger"
        />
      </div>

      {data.by_category.length > 0 && (
        <ChartCard title="By category" className="mb-4">
          <DonutChart
            data={data.by_category.map((row) => ({ ...row, amount: Number(row.amount) }))}
            nameKey="category"
            valueKey="amount"
            currency={currency}
          />
        </ChartCard>
      )}

      <DataTable
        rows={data.expenses}
        columns={[
          { key: 'date', header: 'Date', render: (row) => formatDate(row.date) },
          {
            key: 'description',
            header: 'Description',
            render: (row) => <span className="font-semibold">{row.description}</span>,
          },
          {
            key: 'category',
            header: 'Category',
            hideBelow: 'sm',
            render: (row) => row.category || <span className="text-ink-400">—</span>,
          },
          {
            key: 'amount',
            header: 'Amount',
            align: 'right',
            render: (row) => <span className="tabular font-bold">{money(row.amount)}</span>,
          },
        ]}
        footer={[{ label: 'Total', value: money(data.total) }]}
        empty={<EmptyState title="No expenses in this range" />}
      />
    </div>
  )
}

/* ------------------------------------------------------------ profit/loss */

function ProfitLoss({ data, money }) {
  const rows = [
    { label: 'Gross revenue (incl. GST)', value: data.gross_revenue, tone: 'neutral' },
    { label: 'Less: GST collected', value: `− ${money(data.gst_collected)}`, raw: true },
    { label: 'Net revenue (excl. GST)', value: data.net_revenue, strong: true },
    { label: 'Less: expenses', value: `− ${money(data.expenses)}`, raw: true },
  ]

  return (
    <div>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Gross revenue" value={money(data.gross_revenue)} tone="brand" />
        <StatCard label="Net revenue" value={money(data.net_revenue)} tone="info" />
        <StatCard label="Expenses" value={money(data.expenses)} tone="warning" />
        <StatCard
          label={data.is_profit ? 'Estimated profit' : 'Estimated loss'}
          value={money(data.estimated_profit)}
          hint={`${data.margin_percentage}% margin`}
          tone={data.is_profit ? 'success' : 'danger'}
        />
      </div>

      <section className="card p-5 sm:p-6">
        <h2 className="font-display text-[15px] font-bold text-ink-900">
          Statement · {formatDate(data.range.start)} → {formatDate(data.range.end)}
        </h2>
        <p className="mt-0.5 text-[13px] text-ink-500">
          GST is collected on behalf of the government, so it is excluded from income.
        </p>

        <dl className="mt-5 divide-y divide-ink-100">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-4 py-3">
              <dt className={`text-sm ${row.strong ? 'font-bold text-ink-900' : 'text-ink-600'}`}>
                {row.label}
              </dt>
              <dd
                className={`tabular text-sm ${
                  row.strong ? 'font-bold text-ink-900' : 'font-semibold text-ink-800'
                }`}
              >
                {row.raw ? row.value : money(row.value)}
              </dd>
            </div>
          ))}
          <div
            className={`mt-2 flex items-center justify-between gap-4 rounded-xl px-4 py-4 ${
              data.is_profit ? 'bg-emerald-50' : 'bg-red-50'
            }`}
          >
            <dt
              className={`font-display text-base font-bold ${
                data.is_profit ? 'text-emerald-900' : 'text-red-900'
              }`}
            >
              {data.is_profit ? 'Estimated profit' : 'Estimated loss'}
            </dt>
            <dd
              className={`tabular font-display text-2xl font-bold ${
                data.is_profit ? 'text-emerald-800' : 'text-red-700'
              }`}
            >
              {money(data.estimated_profit)}
            </dd>
          </div>
        </dl>

        <div className="mt-5 grid grid-cols-2 gap-3 border-t border-ink-100 pt-4 sm:grid-cols-4">
          <div>
            <p className="text-[12px] font-semibold uppercase text-ink-500">Bills</p>
            <p className="tabular font-bold">{formatNumber(data.bill_count)}</p>
          </div>
          <div>
            <p className="text-[12px] font-semibold uppercase text-ink-500">Discount given</p>
            <p className="tabular font-bold">{money(data.discount_given)}</p>
          </div>
          <div>
            <p className="text-[12px] font-semibold uppercase text-ink-500">GST collected</p>
            <p className="tabular font-bold">{money(data.gst_collected)}</p>
          </div>
          <div>
            <p className="text-[12px] font-semibold uppercase text-ink-500">Margin</p>
            <p className="tabular font-bold">{data.margin_percentage}%</p>
          </div>
        </div>
      </section>
    </div>
  )
}
