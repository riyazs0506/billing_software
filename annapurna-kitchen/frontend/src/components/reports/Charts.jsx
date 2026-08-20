import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatMoney } from '../../utils/format'

/* One palette, used consistently across every chart in the app. */
export const SERIES = ['#c03f22', '#f59e0b', '#0891b2', '#7c3aed', '#16a34a', '#db2777']

const AXIS = { stroke: '#8b8880', fontSize: 12 }
const GRID = { stroke: '#e7e7e4', strokeDasharray: '3 3' }

function TooltipCard({ active, payload, label, currency = '₹', valueLabel }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-ink-200 bg-white px-3 py-2 shadow-lift">
      <p className="mb-1 text-[12px] font-bold text-ink-700">{label}</p>
      {payload.map((entry) => (
        <p key={entry.dataKey} className="tabular text-[13px] text-ink-800">
          <span
            className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
            style={{ background: entry.color || entry.payload?.fill }}
          />
          {entry.name}:{' '}
          <strong>
            {valueLabel === 'count' ? entry.value : formatMoney(entry.value, currency)}
          </strong>
        </p>
      ))}
    </div>
  )
}

export function SalesTrendChart({ data, currency = '₹', height = 260 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
        <CartesianGrid {...GRID} vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={AXIS} />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={AXIS}
          tickFormatter={(value) => (value >= 1000 ? `${Math.round(value / 1000)}k` : value)}
        />
        <Tooltip content={<TooltipCard currency={currency} />} />
        <Line
          type="monotone"
          dataKey="total"
          name="Sales"
          stroke={SERIES[0]}
          strokeWidth={2.5}
          dot={{ r: 3, fill: SERIES[0] }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

export function BarSeriesChart({
  data,
  xKey,
  yKey,
  name = 'Amount',
  currency = '₹',
  height = 280,
  valueLabel,
  horizontal = false,
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        layout={horizontal ? 'vertical' : 'horizontal'}
        margin={{ top: 8, right: 12, bottom: 0, left: horizontal ? 24 : -12 }}
      >
        <CartesianGrid {...GRID} vertical={horizontal} horizontal={!horizontal} />
        {horizontal ? (
          <>
            <XAxis type="number" tickLine={false} axisLine={false} tick={AXIS} />
            <YAxis
              type="category"
              dataKey={xKey}
              tickLine={false}
              axisLine={false}
              tick={AXIS}
              width={120}
            />
          </>
        ) : (
          <>
            <XAxis dataKey={xKey} tickLine={false} axisLine={false} tick={AXIS} />
            <YAxis tickLine={false} axisLine={false} tick={AXIS} />
          </>
        )}
        <Tooltip
          cursor={{ fill: '#f6f6f5' }}
          content={<TooltipCard currency={currency} valueLabel={valueLabel} />}
        />
        <Bar dataKey={yKey} name={name} radius={horizontal ? [0, 6, 6, 0] : [6, 6, 0, 0]}>
          {data.map((_, index) => (
            <Cell key={index} fill={SERIES[index % SERIES.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

export function DonutChart({ data, nameKey, valueKey, currency = '₹', height = 240 }) {
  const total = data.reduce((sum, row) => sum + Number(row[valueKey] || 0), 0)
  if (!total) {
    return (
      <div className="grid place-items-center text-sm text-ink-400" style={{ height }}>
        No data for this period
      </div>
    )
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          dataKey={valueKey}
          nameKey={nameKey}
          innerRadius="58%"
          outerRadius="82%"
          paddingAngle={2}
          strokeWidth={0}
        >
          {data.map((_, index) => (
            <Cell key={index} fill={SERIES[index % SERIES.length]} />
          ))}
        </Pie>
        <Tooltip content={<TooltipCard currency={currency} />} />
        <Legend
          verticalAlign="bottom"
          iconType="circle"
          formatter={(value) => (
            <span className="text-[13px] capitalize text-ink-700">{value}</span>
          )}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}

export function ChartCard({ title, subtitle, action, children, className = '' }) {
  return (
    <section className={`card p-4 sm:p-5 ${className}`}>
      <header className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-[15px] font-bold text-ink-900">{title}</h2>
          {subtitle && <p className="mt-0.5 text-[13px] text-ink-500">{subtitle}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  )
}
