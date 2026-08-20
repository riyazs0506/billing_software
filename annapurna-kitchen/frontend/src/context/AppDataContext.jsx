import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useAuth } from './AuthContext'
import { useToast } from './ToastContext'
import settingsService from '../services/settingsService'
import inventoryService from '../services/inventoryService'
import { billingService } from '../services/billingService'
import offlineQueue from '../services/offlineQueue'
import useOnlineStatus from '../hooks/useOnlineStatus'

const AppDataContext = createContext(null)

/**
 * Shared app state that several screens need: business/tax/printer settings,
 * the low-stock alert feed, and offline queue status.
 */
export function AppDataProvider({ children }) {
  const { isAuthenticated } = useAuth()
  const toast = useToast()
  const { online } = useOnlineStatus()

  const [settings, setSettings] = useState({})
  const [alerts, setAlerts] = useState([])
  const [queueCount, setQueueCount] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const wasOffline = useRef(false)

  const loadSettings = useCallback(async () => {
    if (!isAuthenticated) return
    try {
      const data = await settingsService.public()
      setSettings(data.flat || {})
    } catch {
      /* non-fatal: defaults still render */
    }
  }, [isAuthenticated])

  const loadAlerts = useCallback(async () => {
    if (!isAuthenticated) return
    try {
      setAlerts(await inventoryService.alerts())
    } catch {
      /* non-fatal */
    }
  }, [isAuthenticated])

  const refreshQueueCount = useCallback(async () => {
    setQueueCount(await offlineQueue.count())
  }, [])

  const flushQueue = useCallback(
    async ({ silent = false } = {}) => {
      const pending = await offlineQueue.count()
      if (!pending) return null
      setSyncing(true)
      try {
        const outcome = await billingService.flushQueue()
        await refreshQueueCount()
        if (!silent && outcome) {
          const settled = outcome.synced + outcome.duplicates
          if (settled) {
            toast.success(
              `${settled} offline sale${settled === 1 ? '' : 's'} synced.`,
              { title: 'Back online' }
            )
          }
          if (outcome.failed) {
            toast.error(
              `${outcome.failed} queued sale${outcome.failed === 1 ? '' : 's'} could not sync. They are kept for retry.`
            )
          }
        }
        return outcome
      } catch (error) {
        if (!silent) toast.fromError(error, 'Could not sync the offline queue.')
        return null
      } finally {
        setSyncing(false)
      }
    },
    [refreshQueueCount, toast]
  )

  useEffect(() => {
    if (!isAuthenticated) {
      setSettings({})
      setAlerts([])
      return
    }
    loadSettings()
    loadAlerts()
    refreshQueueCount()
  }, [isAuthenticated, loadSettings, loadAlerts, refreshQueueCount])

  // Reconnect detection: flush whatever billing happened while offline.
  useEffect(() => {
    if (!isAuthenticated) return
    if (!online) {
      wasOffline.current = true
      return
    }
    if (wasOffline.current) {
      wasOffline.current = false
      flushQueue()
    }
  }, [online, isAuthenticated, flushQueue])

  const value = useMemo(
    () => ({
      settings,
      setting: (key, fallback = '') => settings[key] ?? fallback,
      currency: settings['business.currency_symbol'] || '₹',
      businessName: settings['business.name'] || 'Annapurna Kitchen',
      paperWidth: settings['printer.paper_width'] || '80',
      receiptMode: settings['printer.receipt_mode'] || 'browser',
      kotMode: settings['printer.kot_mode'] || 'browser',
      receiptPrinter: settings['printer.receipt_printer_name'] || '',
      kotPrinter: settings['printer.kot_printer_name'] || '',
      autoPrintReceipt: settings['printer.auto_print_receipt'] !== 'false',
      autoPrintKot: settings['printer.auto_print_kot'] !== 'false',
      loyaltyEnabled: settings['loyalty.enabled'] === 'true',
      reloadSettings: loadSettings,
      alerts,
      reloadAlerts: loadAlerts,
      online,
      queueCount,
      syncing,
      refreshQueueCount,
      flushQueue,
    }),
    [
      settings,
      alerts,
      online,
      queueCount,
      syncing,
      loadSettings,
      loadAlerts,
      refreshQueueCount,
      flushQueue,
    ]
  )

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>
}

export function useAppData() {
  const context = useContext(AppDataContext)
  if (!context) throw new Error('useAppData must be used inside <AppDataProvider>')
  return context
}

export default AppDataContext
