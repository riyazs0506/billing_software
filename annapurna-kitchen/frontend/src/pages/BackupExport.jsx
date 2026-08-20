import { useCallback, useEffect, useState } from 'react'
import { useToast } from '../context/ToastContext'
import backupService from '../services/backupService'
import reportService from '../services/reportService'
import Button from '../components/common/Button'
import DataTable from '../components/common/DataTable'
import { Badge, DateRangeBar, PageHeader, StatCard } from '../components/common/Bits'
import { EmptyState, ErrorState } from '../components/common/States'
import { IconAlert, IconBackup, IconDownload, IconRefresh } from '../components/common/Icons'
import { daysAgoIso, formatDateTime, todayIso } from '../utils/format'

const EXPORTS = [
  { kind: 'daily', label: 'Daily sales', hint: 'Totals per day plus the payment-mode split' },
  { kind: 'item-wise', label: 'Item-wise sales', hint: 'Quantity and revenue per dish' },
  { kind: 'staff-wise', label: 'Staff-wise sales', hint: 'Attribution by the account on each bill' },
  { kind: 'expenses', label: 'Expenses', hint: 'Every recorded expense in the range' },
  { kind: 'profit-loss', label: 'Profit & loss', hint: 'Revenue, GST, expenses and margin' },
  { kind: 'bills', label: 'Bill ledger', hint: 'Every settled invoice, line by line' },
]

function humanSize(bytes) {
  if (!bytes) return '—'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let index = 0
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index += 1
  }
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}

export default function BackupExport() {
  const toast = useToast()

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [running, setRunning] = useState(false)
  const [start, setStart] = useState(daysAgoIso(29))
  const [end, setEnd] = useState(todayIso())
  const [exporting, setExporting] = useState(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      setData(await backupService.list())
    } catch (caught) {
      setError(caught)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function runBackup() {
    setRunning(true)
    try {
      const log = await backupService.run()
      toast.success(`Backup written: ${log.filename}`)
      load()
    } catch (caught) {
      // A failed backup is surfaced, never swallowed.
      toast.error(caught.message || 'The backup failed.', { title: 'Backup failed' })
      load()
    } finally {
      setRunning(false)
    }
  }

  async function runExport(kind, format) {
    setExporting(`${kind}-${format}`)
    try {
      const filename = await reportService.export(kind, format, start, end)
      toast.success(`Downloaded ${filename}.`)
    } catch (caught) {
      toast.fromError(caught, 'Export failed.')
    } finally {
      setExporting(null)
    }
  }

  if (error) return <ErrorState error={error} onRetry={load} />

  const backups = data?.backups || []
  const schedule = data?.schedule
  const lastSuccess = backups.find((row) => row.status === 'success')
  const lastFailed = backups[0]?.status === 'failed' ? backups[0] : null

  return (
    <div>
      <PageHeader
        title="Backup & Export"
        subtitle="Automated nightly database backups, plus spreadsheet exports of any report."
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
              icon={<IconBackup className="h-4 w-4" />}
              onClick={runBackup}
              loading={running}
            >
              Back up now
            </Button>
          </>
        }
      />

      {lastFailed && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <IconAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          <div className="min-w-0">
            <p className="text-sm font-bold text-red-900">The last backup attempt failed</p>
            <p className="mt-0.5 break-words text-[13px] text-red-800">{lastFailed.message}</p>
          </div>
        </div>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Last successful backup"
          value={lastSuccess ? formatDateTime(lastSuccess.created_at) : 'Never'}
          hint={lastSuccess ? humanSize(lastSuccess.size_bytes) : 'Run one now'}
          tone={lastSuccess ? 'success' : 'danger'}
          loading={loading}
          icon={<IconBackup className="h-4 w-4" />}
        />
        <StatCard
          label="Automated schedule"
          value={
            schedule?.enabled
              ? `${String(schedule.hour).padStart(2, '0')}:${String(schedule.minute).padStart(2, '0')}`
              : 'Disabled'
          }
          hint={schedule?.enabled ? 'Runs daily on the server' : 'Set BACKUP_ENABLED=true'}
          tone={schedule?.enabled ? 'info' : 'warning'}
          loading={loading}
        />
        <StatCard
          label="Retention"
          value={schedule ? `${schedule.retention_days} days` : '—'}
          hint="Older archives are pruned automatically"
          tone="neutral"
          loading={loading}
        />
        <StatCard
          label="Attempts recorded"
          value={backups.length}
          tone="brand"
          loading={loading}
        />
      </div>

      {/* exports */}
      <section className="mb-6">
        <h2 className="section-title mb-2">Data export</h2>
        <DateRangeBar
          start={start}
          end={end}
          onChange={(nextStart, nextEnd) => {
            setStart(nextStart)
            setEnd(nextEnd)
          }}
          presets={[
            { label: 'Today', start_date: todayIso(), end_date: todayIso() },
            { label: 'Last 7 days', start_date: daysAgoIso(6), end_date: todayIso() },
            { label: 'Last 30 days', start_date: daysAgoIso(29), end_date: todayIso() },
          ]}
          right={
            <Button
              icon={<IconDownload className="h-4 w-4" />}
              onClick={() => runExport('all', 'xlsx')}
              loading={exporting === 'all-xlsx'}
            >
              Everything (Excel)
            </Button>
          }
        />

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {EXPORTS.map((entry) => (
            <article key={entry.kind} className="card flex flex-col p-4">
              <h3 className="font-display text-[15px] font-bold text-ink-900">{entry.label}</h3>
              <p className="mt-0.5 flex-1 text-[13px] text-ink-500">{entry.hint}</p>
              <div className="mt-3 flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  fullWidth
                  icon={<IconDownload className="h-4 w-4" />}
                  onClick={() => runExport(entry.kind, 'csv')}
                  loading={exporting === `${entry.kind}-csv`}
                >
                  CSV
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  fullWidth
                  icon={<IconDownload className="h-4 w-4" />}
                  onClick={() => runExport(entry.kind, 'xlsx')}
                  loading={exporting === `${entry.kind}-xlsx`}
                >
                  Excel
                </Button>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* backup log */}
      <section>
        <h2 className="section-title mb-2">Backup history</h2>
        <DataTable
          loading={loading}
          rows={backups}
          columns={[
            {
              key: 'created_at',
              header: 'When',
              render: (row) => formatDateTime(row.created_at),
            },
            {
              key: 'status',
              header: 'Result',
              align: 'center',
              render: (row) => (
                <Badge tone={row.status === 'success' ? 'success' : 'danger'}>{row.status}</Badge>
              ),
            },
            {
              key: 'trigger',
              header: 'Trigger',
              align: 'center',
              hideBelow: 'sm',
              render: (row) => <span className="capitalize">{row.trigger}</span>,
            },
            {
              key: 'size_bytes',
              header: 'Size',
              align: 'right',
              hideBelow: 'sm',
              render: (row) => <span className="tabular">{humanSize(row.size_bytes)}</span>,
            },
            {
              key: 'filename',
              header: 'File',
              render: (row) =>
                row.status === 'success' && row.filename ? (
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await backupService.download(row.filename)
                      } catch (caught) {
                        toast.fromError(caught, 'That file could not be downloaded.')
                      }
                    }}
                    className="inline-flex items-center gap-1.5 rounded px-1 text-[13px] font-semibold text-brand-700 hover:underline"
                  >
                    <IconDownload className="h-4 w-4" />
                    {row.filename}
                  </button>
                ) : (
                  <span className="text-[13px] text-red-700">{row.message}</span>
                ),
            },
          ]}
          empty={
            <EmptyState
              title="No backups recorded yet"
              description="Run one now, or wait for the nightly schedule."
              action={
                <Button icon={<IconBackup className="h-4 w-4" />} onClick={runBackup}>
                  Back up now
                </Button>
              }
            />
          }
        />
      </section>
    </div>
  )
}
