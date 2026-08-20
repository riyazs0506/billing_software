import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useAppData } from '../../context/AppDataContext'
import { navFor } from './navigation'
import { ConfirmDialog } from '../common/Bits'
import {
  IconAlert,
  IconBurger,
  IconClock,
  IconLogout,
  IconOffline,
  IconRefresh,
  IconWifi,
  IconX,
} from '../common/Icons'
import { formatTime, initials } from '../../utils/format'

function Brand({ compact = false }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-600 to-brand-800 font-display text-sm font-bold text-white shadow-sm">
        AK
      </span>
      {!compact && (
        <span className="min-w-0">
          <span className="block truncate font-display text-[15px] font-bold leading-tight text-white">
            Annapurna Kitchen
          </span>
          <span className="block text-[11px] font-medium uppercase tracking-[0.14em] text-brand-200">
            Billing System
          </span>
        </span>
      )}
    </div>
  )
}

function ConnectionPill() {
  const { online, queueCount, syncing, flushQueue } = useAppData()

  if (online && !queueCount) {
    return (
      <span className="chip bg-emerald-50 text-emerald-700" title="Connected to the server">
        <IconWifi className="h-3.5 w-3.5" />
        Online
      </span>
    )
  }

  if (!online) {
    return (
      <span
        className="chip animate-pulse-ring bg-amber-100 text-amber-900"
        title="Billing continues; sales are queued locally and sync on reconnect."
      >
        <IconOffline className="h-3.5 w-3.5" />
        Offline{queueCount ? ` · ${queueCount} queued` : ''}
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={() => flushQueue()}
      disabled={syncing}
      className="chip bg-sky-100 text-sky-800 transition hover:bg-sky-200"
      title="Send queued offline sales now"
    >
      <IconRefresh className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
      {syncing ? 'Syncing…' : `${queueCount} to sync`}
    </button>
  )
}

/** Non-blocking low-stock banner: Billing Screen + Inventory Dashboard. */
export function LowStockBanner({ className = '' }) {
  const { alerts } = useAppData()
  const [dismissed, setDismissed] = useState([])

  const visible = alerts.filter((alert) => !dismissed.includes(alert.raw_material_id))
  if (!visible.length) return null

  return (
    <div
      className={`no-print flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 ${className}`}
      role="status"
    >
      <span className="flex shrink-0 items-center gap-1.5 text-[13px] font-bold uppercase tracking-wide text-amber-800">
        <IconAlert className="h-4 w-4" />
        Low stock
      </span>
      <div className="flex min-w-0 flex-1 flex-wrap gap-x-4 gap-y-1">
        {visible.slice(0, 4).map((alert) => (
          <span key={alert.raw_material_id} className="text-[13px] text-amber-900">
            <strong className="font-semibold">{alert.raw_material_name}</strong>
            {' — only '}
            <span className="tabular font-bold">{alert.lowest_min_output}</span>
            {alert.menu_item_name ? ` ${alert.menu_item_name}` : ` ${alert.unit}`} left
          </span>
        ))}
        {visible.length > 4 && (
          <span className="text-[13px] font-semibold text-amber-800">
            +{visible.length - 4} more
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={() => setDismissed(alerts.map((a) => a.raw_material_id))}
        className="ml-auto rounded p-1 text-amber-700 transition hover:bg-amber-100"
        aria-label="Dismiss low-stock banner"
      >
        <IconX className="h-4 w-4" />
      </button>
    </div>
  )
}

export default function AppShell({ children }) {
  const { user, shift, logout } = useAuth()
  const location = useLocation()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [confirmLogout, setConfirmLogout] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)

  const items = navFor(user?.role || 'cashier')

  useEffect(() => {
    setDrawerOpen(false)
  }, [location.pathname])

  async function handleLogout() {
    setLoggingOut(true)
    try {
      await logout()
    } finally {
      setLoggingOut(false)
      setConfirmLogout(false)
    }
  }

  const nav = (
    <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4" aria-label="Main">
      {items.map((item) => {
        const Icon = item.icon
        return (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              [
                'tap flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition',
                isActive
                  ? 'bg-white/12 text-white shadow-inset'
                  : 'text-brand-100/85 hover:bg-white/8 hover:text-white',
              ].join(' ')
            }
          >
            <Icon className="h-[18px] w-[18px] shrink-0" />
            {item.label}
          </NavLink>
        )
      })}
    </nav>
  )

  const footer = (
    <div className="border-t border-white/10 px-3 py-3">
      <div className="mb-2 flex items-center gap-2.5 rounded-lg px-2 py-2">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-saffron-400 font-display text-[13px] font-bold text-ink-950">
          {initials(user?.name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-white">{user?.name}</span>
          <span className="block text-[11px] font-semibold uppercase tracking-wider text-brand-200">
            {user?.role}
          </span>
        </span>
      </div>
      {shift?.login_time && (
        <p className="mb-2 flex items-center gap-1.5 px-2 text-[11px] text-brand-200/90">
          <IconClock className="h-3 w-3" />
          On shift since {formatTime(shift.login_time)}
        </p>
      )}
      <button
        type="button"
        onClick={() => setConfirmLogout(true)}
        className="tap flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-brand-100/85 transition hover:bg-white/8 hover:text-white"
      >
        <IconLogout className="h-[18px] w-[18px]" />
        Log out
      </button>
    </div>
  )

  return (
    <div className="flex min-h-screen bg-ink-50">
      {/* desktop sidebar */}
      <aside className="no-print sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-gradient-to-b from-brand-900 to-brand-950 lg:flex">
        <div className="px-4 py-4">
          <Brand />
        </div>
        {nav}
        {footer}
      </aside>

      {/* mobile / tablet drawer */}
      {drawerOpen && (
        <div className="no-print fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-ink-950/50"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative flex h-full w-64 animate-slide-up flex-col bg-gradient-to-b from-brand-900 to-brand-950">
            <div className="flex items-center justify-between px-4 py-4">
              <Brand />
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="rounded-lg p-1.5 text-brand-200 hover:bg-white/10"
                aria-label="Close menu"
              >
                <IconX />
              </button>
            </div>
            {nav}
            {footer}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-ink-200 bg-white/85 px-4 backdrop-blur-md sm:px-6">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="tap -ml-1 rounded-lg p-2 text-ink-600 transition hover:bg-ink-100 lg:hidden"
            aria-label="Open menu"
          >
            <IconBurger />
          </button>
          <span className="lg:hidden">
            <Brand compact />
          </span>

          <div className="ml-auto flex items-center gap-2.5">
            <ConnectionPill />
            <span className="hidden items-center gap-2 border-l border-ink-200 pl-3 sm:flex">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-100 font-display text-xs font-bold text-brand-800">
                {initials(user?.name)}
              </span>
              <span className="hidden text-left md:block">
                <span className="block text-[13px] font-semibold leading-tight text-ink-800">
                  {user?.name}
                </span>
                <span className="block text-[11px] font-semibold uppercase tracking-wider text-ink-400">
                  {user?.role}
                </span>
              </span>
            </span>
          </div>
        </header>

        <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 sm:py-6">{children}</main>
      </div>

      <ConfirmDialog
        open={confirmLogout}
        title="Log out?"
        message="Your shift end time will be recorded. Any unsynced offline sales stay queued on this device."
        confirmLabel="Log out"
        variant="danger"
        loading={loggingOut}
        onConfirm={handleLogout}
        onCancel={() => setConfirmLogout(false)}
      />
    </div>
  )
}
