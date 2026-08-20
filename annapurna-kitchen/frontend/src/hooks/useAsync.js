import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Runs an async loader and exposes {data, loading, error, reload}.
 * Guards against setting state after unmount.
 */
export function useAsync(loader, deps = [], { immediate = true } = {}) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(immediate)
  const [error, setError] = useState(null)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const run = useCallback(
    async (...args) => {
      setLoading(true)
      setError(null)
      try {
        const result = await loader(...args)
        if (mounted.current) setData(result)
        return result
      } catch (caught) {
        if (mounted.current) setError(caught)
        throw caught
      } finally {
        if (mounted.current) setLoading(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    deps
  )

  useEffect(() => {
    if (immediate) run().catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, immediate])

  return { data, setData, loading, error, reload: run }
}

export default useAsync
