import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { lockScroll, unlockScroll } from '../../utils/scrollLock'

const SIZES = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  full: 'max-w-6xl',
}

/** Stack of currently-open dialogs, so only the topmost reacts to Escape. */
const stack = []

export default function Modal({
  open,
  onClose,
  title,
  subtitle,
  size = 'md',
  footer = null,
  children,
  closeOnBackdrop = true,
  hideClose = false,
  bodyClassName = '',
}) {
  const panelRef = useRef(null)
  const idRef = useRef({})

  useEffect(() => {
    if (!open) return undefined

    const id = idRef.current
    stack.push(id)
    lockScroll()

    const previouslyFocused = document.activeElement

    function onKeyDown(event) {
      // Only the dialog on top of the stack responds.
      if (stack[stack.length - 1] !== id) return

      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose?.()
        return
      }
      if (event.key !== 'Tab' || !panelRef.current) return

      const focusable = panelRef.current.querySelectorAll(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)

    const timer = setTimeout(() => {
      const autofocus = panelRef.current?.querySelector('[data-autofocus]')
      ;(autofocus || panelRef.current)?.focus()
    }, 30)

    return () => {
      clearTimeout(timer)
      document.removeEventListener('keydown', onKeyDown)

      const index = stack.indexOf(id)
      if (index !== -1) stack.splice(index, 1)
      unlockScroll()

      if (previouslyFocused instanceof HTMLElement && document.contains(previouslyFocused)) {
        previouslyFocused.focus()
      }
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="no-print fixed inset-0 z-[70] flex items-end justify-center p-0 sm:items-center sm:p-6">
      <div
        className="absolute inset-0 animate-fade-in bg-ink-950/45 backdrop-blur-[2px]"
        onClick={closeOnBackdrop ? onClose : undefined}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        tabIndex={-1}
        className={`relative flex max-h-[92dvh] w-full ${
          SIZES[size] || SIZES.md
        } animate-slide-up flex-col overflow-hidden rounded-t-2xl bg-white shadow-lift outline-none sm:max-h-[88dvh] sm:rounded-2xl`}
      >
        {(title || !hideClose) && (
          <header className="flex shrink-0 items-start justify-between gap-4 border-b border-ink-100 px-5 py-4">
            <div className="min-w-0">
              {title && (
                <h2 className="font-display text-lg font-bold leading-tight text-ink-900">
                  {title}
                </h2>
              )}
              {subtitle && <p className="mt-0.5 text-sm text-ink-500">{subtitle}</p>}
            </div>
            {!hideClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="-mr-1 -mt-1 shrink-0 rounded-lg p-2 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </header>
        )}

        {/* min-h-0 is what actually lets this scroll inside a flex column */}
        <div
          className={`min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 ${bodyClassName}`}
        >
          {children}
        </div>

        {footer && (
          <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-ink-100 bg-ink-50/70 px-5 py-3.5">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body
  )
}
