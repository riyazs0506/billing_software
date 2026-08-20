import { useEffect } from 'react'

/**
 * Counter keyboard shortcuts. Ignored while the user is typing in a field so
 * a cashier entering a customer name never triggers "Generate Bill".
 */
export function useHotkeys(map, enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined

    function onKeyDown(event) {
      const target = event.target
      const typing =
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)

      const parts = []
      if (event.ctrlKey || event.metaKey) parts.push('ctrl')
      if (event.altKey) parts.push('alt')
      if (event.shiftKey) parts.push('shift')
      parts.push(event.key.toLowerCase())
      const combo = parts.join('+')

      const handler = map[combo]
      if (!handler) return
      if (typing && !combo.startsWith('ctrl') && combo !== 'escape') return

      event.preventDefault()
      handler(event)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [map, enabled])
}

export default useHotkeys
