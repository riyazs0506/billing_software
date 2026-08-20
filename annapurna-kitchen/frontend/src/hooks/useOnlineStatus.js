import { useEffect, useState } from 'react'
import { health } from '../services/api'

/**
 * Tracks connectivity. navigator.onLine only proves the NIC is up, so a
 * background probe of /api/health decides whether the server is really
 * reachable - that is what drives the offline indicator and queue flush.
 */
export function useOnlineStatus(pollMs = 20000) {
  const [online, setOnline] = useState(navigator.onLine)
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function probe() {
      if (cancelled) return
      setChecking(true)
      const reachable = navigator.onLine ? await health() : false
      if (!cancelled) {
        setOnline(reachable)
        setChecking(false)
      }
    }

    const goOnline = () => probe()
    const goOffline = () => setOnline(false)

    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    probe()
    const timer = setInterval(probe, pollMs)

    return () => {
      cancelled = true
      clearInterval(timer)
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [pollMs])

  return { online, checking }
}

export default useOnlineStatus
