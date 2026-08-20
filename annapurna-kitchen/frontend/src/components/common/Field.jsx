import { useId } from 'react'

function ErrorText({ children }) {
  if (!children) return null
  return (
    <p className="mt-1.5 flex items-start gap-1 text-[13px] font-medium text-red-600">
      <svg className="mt-0.5 h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeWidth="2" d="M12 9v3m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      {children}
    </p>
  )
}

export function Input({ label, error, hint, prefix, suffix, className = '', id, ...rest }) {
  const generated = useId()
  const inputId = id || generated
  return (
    <div className={className}>
      {label && (
        <label className="label" htmlFor={inputId}>
          {label}
          {rest.required && <span className="ml-0.5 text-brand-600">*</span>}
        </label>
      )}
      <div className="relative">
        {prefix && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-ink-400">
            {prefix}
          </span>
        )}
        <input
          id={inputId}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${inputId}-error` : undefined}
          className={`field ${error ? 'field-error' : ''} ${prefix ? 'pl-8' : ''} ${
            suffix ? 'pr-12' : ''
          }`}
          {...rest}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-ink-400">
            {suffix}
          </span>
        )}
      </div>
      {hint && !error && <p className="mt-1.5 text-[13px] text-ink-500">{hint}</p>}
      <span id={`${inputId}-error`}>
        <ErrorText>{error}</ErrorText>
      </span>
    </div>
  )
}

export function Select({ label, error, hint, options = [], className = '', id, children, ...rest }) {
  const generated = useId()
  const selectId = id || generated
  return (
    <div className={className}>
      {label && (
        <label className="label" htmlFor={selectId}>
          {label}
          {rest.required && <span className="ml-0.5 text-brand-600">*</span>}
        </label>
      )}
      <select
        id={selectId}
        aria-invalid={Boolean(error)}
        className={`field appearance-none bg-[length:1rem] bg-[right_0.75rem_center] bg-no-repeat pr-9 ${
          error ? 'field-error' : ''
        }`}
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23706d66' stroke-width='2'%3E%3Cpath stroke-linecap='round' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E\")",
        }}
        {...rest}
      >
        {children ||
          options.map((option) => (
            <option key={option.value ?? option} value={option.value ?? option}>
              {option.label ?? option}
            </option>
          ))}
      </select>
      {hint && !error && <p className="mt-1.5 text-[13px] text-ink-500">{hint}</p>}
      <ErrorText>{error}</ErrorText>
    </div>
  )
}

export function Textarea({ label, error, hint, className = '', id, ...rest }) {
  const generated = useId()
  const areaId = id || generated
  return (
    <div className={className}>
      {label && (
        <label className="label" htmlFor={areaId}>
          {label}
        </label>
      )}
      <textarea
        id={areaId}
        rows={3}
        className={`field resize-y ${error ? 'field-error' : ''}`}
        {...rest}
      />
      {hint && !error && <p className="mt-1.5 text-[13px] text-ink-500">{hint}</p>}
      <ErrorText>{error}</ErrorText>
    </div>
  )
}

export function Toggle({ checked, onChange, label, description, disabled = false }) {
  return (
    <label
      className={`flex items-start gap-3 ${
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
      }`}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange?.(!checked)}
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ${
          checked ? 'bg-brand-600' : 'bg-ink-300'
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${
            checked ? 'translate-x-[1.375rem]' : 'translate-x-0.5'
          }`}
        />
      </button>
      {(label || description) && (
        <span className="min-w-0">
          {label && <span className="block text-sm font-semibold text-ink-800">{label}</span>}
          {description && <span className="block text-[13px] text-ink-500">{description}</span>}
        </span>
      )}
    </label>
  )
}

export default Input
