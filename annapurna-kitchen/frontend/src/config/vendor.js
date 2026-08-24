/**
 * Vendor identity — the company that builds and supports this software.
 *
 * Single source of truth: every place the support details appear (sidebar,
 * dashboards, login, the support dialog) reads from here, so changing a phone
 * number is a one-line edit.
 *
 * Not to be confused with the *restaurant's* business details, which the owner
 * edits under Settings → Business and which print on customer invoices.
 */

export const VENDOR = {
  name: 'Nexverr Technology',
  tagline: 'Software design & development',
  role: 'Developed and supported by',

  /** Support lines, in the order they should be tried. */
  phones: [
    { label: 'Support line 1', number: '8122935506' },
    { label: 'Support line 2', number: '8148265176' },
  ],

  /** Country code used to build tel: links. */
  dialPrefix: '+91',

  supportHours: 'Mon–Sat, 9:00 AM – 9:00 PM',
}

/** `8122935506` -> `+918122935506` for a tel: href. */
export function telHref(number) {
  const digits = String(number).replace(/\D/g, '')
  const prefix = VENDOR.dialPrefix.replace(/\D/g, '')
  return `tel:${digits.startsWith(prefix) ? '+' : VENDOR.dialPrefix}${digits}`
}

/** `8122935506` -> `81229 35506` — easier to read and to dictate over a call. */
export function formatPhone(number) {
  const digits = String(number).replace(/\D/g, '')
  if (digits.length === 10) return `${digits.slice(0, 5)} ${digits.slice(5)}`
  return digits
}

export default VENDOR
