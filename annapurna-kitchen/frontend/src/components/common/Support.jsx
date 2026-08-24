import { useState } from 'react'
import Modal from './Modal'
import Button from './Button'
import { IconPhone, IconSupport } from './Icons'
import { VENDOR, formatPhone, telHref } from '../../config/vendor'

/**
 * Vendor support surfaces.
 *
 * The numbers are real click-to-call links (`tel:`), so on the counter tablet
 * a single tap dials — which is the whole point of putting them in front of
 * staff rather than on a sticker behind the till.
 */

/** One call button. */
function CallButton({ phone, size = 'md' }) {
  const pad = size === 'lg' ? 'px-4 py-3' : 'px-3 py-2.5'
  return (
    <a
      href={telHref(phone.number)}
      className={`tap group flex items-center gap-3 rounded-xl border border-brand-200 bg-white ${pad} transition hover:-translate-y-0.5 hover:border-brand-400 hover:shadow-lift`}
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-100 text-brand-700 transition group-hover:bg-brand-600 group-hover:text-white">
        <IconPhone className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="tabular block font-display text-[17px] font-bold leading-tight text-ink-900">
          {formatPhone(phone.number)}
        </span>
        <span className="block text-[12px] font-medium text-ink-500">{phone.label}</span>
      </span>
    </a>
  )
}

/**
 * Full support card — used on the Admin dashboard and the Cashier counter
 * home, so whoever is on shift always has the number in reach.
 */
export function SupportCard({ className = '' }) {
  return (
    <section
      className={`card overflow-hidden ${className}`}
      aria-label={`Support from ${VENDOR.name}`}
    >
      <div className="grid gap-5 p-5 sm:grid-cols-[1.1fr_1fr] sm:items-center sm:p-6">
        <div className="min-w-0">
          <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-brand-600">
            {VENDOR.role}
          </p>
          <h2 className="mt-1 font-display text-2xl font-bold tracking-tight text-ink-900">
            {VENDOR.name}
          </h2>
          <p className="mt-1 text-sm text-ink-500">{VENDOR.tagline}</p>

          <p className="mt-4 text-sm leading-relaxed text-ink-600">
            Something not working, or need a change to the menu, tax or printer setup?
            Call us directly — no ticket, no waiting.
          </p>
          <p className="mt-2 text-[13px] text-ink-400">{VENDOR.supportHours}</p>
        </div>

        <div className="grid gap-2.5">
          {VENDOR.phones.map((phone) => (
            <CallButton key={phone.number} phone={phone} size="lg" />
          ))}
        </div>
      </div>
    </section>
  )
}

/**
 * Compact strip for the sidebar footer — present on every screen for both
 * roles, without taking space from the billing grid.
 */
export function SupportStrip() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="tap flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition hover:bg-white/10"
        title={`Support — ${VENDOR.name}`}
      >
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-white/10 text-brand-100">
          <IconSupport className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12px] font-bold leading-tight text-white">
            {VENDOR.name}
          </span>
          <span className="block text-[10px] font-medium uppercase tracking-[0.1em] text-brand-200/80">
            Tap for support
          </span>
        </span>
      </button>

      <SupportDialog open={open} onClose={() => setOpen(false)} />
    </>
  )
}

/** Shared dialog with both numbers. */
export function SupportDialog({ open, onClose }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${VENDOR.name} — support`}
      subtitle={VENDOR.supportHours}
      size="sm"
      footer={
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      <p className="mb-4 text-sm leading-relaxed text-ink-600">
        Call us for anything: a problem at the counter, menu or price changes, tax and
        printer setup, or new features.
      </p>
      <div className="grid gap-2.5">
        {VENDOR.phones.map((phone) => (
          <CallButton key={phone.number} phone={phone} size="lg" />
        ))}
      </div>
      <p className="mt-4 text-center text-[12px] text-ink-400">
        {VENDOR.role} {VENDOR.name}
      </p>
    </Modal>
  )
}

/** One-line credit for the login screen. */
export function VendorByline({ className = '' }) {
  return (
    <div className={`text-center ${className}`}>
      <p className="text-[12px] text-brand-200/70">
        {VENDOR.role}{' '}
        <span className="font-semibold text-brand-100">{VENDOR.name}</span>
      </p>
      <p className="mt-1 flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
        {VENDOR.phones.map((phone) => (
          <a
            key={phone.number}
            href={telHref(phone.number)}
            className="tabular text-[12px] font-semibold text-brand-200/90 underline-offset-2 transition hover:text-white hover:underline"
          >
            {formatPhone(phone.number)}
          </a>
        ))}
      </p>
    </div>
  )
}

export default SupportCard
