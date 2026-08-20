/**
 * Reference-counted body scroll lock.
 *
 * Every open dialog acquires the lock; the page is only unlocked when the last
 * one releases. Previously each Modal saved and restored
 * `document.body.style.overflow` on its own, so two stacked dialogs (an edit
 * modal with a delete-confirm on top) could restore in the wrong order and
 * leave the page permanently unscrollable.
 */

let depth = 0
let previousOverflow = ''
let previousPaddingRight = ''

/** Width of the classic scrollbar, so hiding it does not shift the layout. */
function scrollbarWidth() {
  return window.innerWidth - document.documentElement.clientWidth
}

export function lockScroll() {
  if (typeof document === 'undefined') return
  depth += 1
  if (depth > 1) return

  const { body } = document
  previousOverflow = body.style.overflow
  previousPaddingRight = body.style.paddingRight

  const gap = scrollbarWidth()
  body.style.overflow = 'hidden'
  if (gap > 0) {
    const current = parseFloat(window.getComputedStyle(body).paddingRight) || 0
    body.style.paddingRight = `${current + gap}px`
  }
}

export function unlockScroll() {
  if (typeof document === 'undefined') return
  depth = Math.max(0, depth - 1)
  if (depth > 0) return

  const { body } = document
  body.style.overflow = previousOverflow
  body.style.paddingRight = previousPaddingRight
  previousOverflow = ''
  previousPaddingRight = ''
}

/** Escape / focus-trap should only act on the topmost dialog. */
export function lockDepth() {
  return depth
}

/** Escape hatch for hot-reload and error recovery. */
export function resetScrollLock() {
  depth = 0
  if (typeof document !== 'undefined') {
    document.body.style.overflow = ''
    document.body.style.paddingRight = ''
  }
}
