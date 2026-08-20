import Button from './Button'

/** Skeleton placeholders keep layout stable while data loads. */
export function Skeleton({ className = 'h-4 w-full' }) {
  return <div className={`skeleton ${className}`} />
}

export function SkeletonCard({ lines = 3 }) {
  return (
    <div className="card p-5">
      <Skeleton className="mb-3 h-5 w-2/5" />
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton key={index} className={`mb-2 h-3.5 ${index % 2 ? 'w-4/5' : 'w-full'}`} />
      ))}
    </div>
  )
}

export function SkeletonTable({ rows = 6, cols = 5 }) {
  return (
    <div className="card overflow-hidden">
      <div className="flex gap-4 border-b border-ink-100 bg-ink-50 px-5 py-3">
        {Array.from({ length: cols }).map((_, index) => (
          <Skeleton key={index} className="h-3.5 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex gap-4 border-b border-ink-50 px-5 py-4 last:border-0">
          {Array.from({ length: cols }).map((_, colIndex) => (
            <Skeleton key={colIndex} className="h-3.5 flex-1" />
          ))}
        </div>
      ))}
    </div>
  )
}

export function SkeletonGrid({ count = 8 }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="card p-4">
          <Skeleton className="mb-2.5 h-4 w-4/5" />
          <Skeleton className="h-6 w-1/3" />
        </div>
      ))}
    </div>
  )
}

export function Loader({ label = 'Loading…', className = '' }) {
  return (
    <div className={`flex items-center justify-center gap-2.5 py-10 text-ink-500 ${className}`}>
      <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
      </svg>
      <span className="text-sm font-medium">{label}</span>
    </div>
  )
}

export function EmptyState({ icon, title, description, action, className = '' }) {
  return (
    <div className={`flex flex-col items-center justify-center px-6 py-14 text-center ${className}`}>
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-ink-100 text-ink-400">
        {icon || (
          <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.6"
              d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
            />
          </svg>
        )}
      </div>
      <h3 className="font-display text-base font-bold text-ink-800">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-sm text-ink-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function ErrorState({ error, onRetry, title = 'Could not load this' }) {
  const offline = error?.isOffline
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-red-50 text-red-500">
        <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.6"
            d={
              offline
                ? 'M18.364 5.636a9 9 0 010 12.728m-12.728 0a9 9 0 010-12.728m3.536 9.192a4 4 0 010-5.656M3 3l18 18'
                : 'M12 9v3m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
            }
          />
        </svg>
      </div>
      <h3 className="font-display text-base font-bold text-ink-800">
        {offline ? 'You are offline' : title}
      </h3>
      <p className="mt-1.5 max-w-sm text-sm text-ink-500">
        {error?.message || 'An unexpected error occurred.'}
      </p>
      {onRetry && (
        <Button variant="secondary" className="mt-5" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}

export default EmptyState
