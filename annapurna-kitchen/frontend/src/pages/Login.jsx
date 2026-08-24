import { useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { HOME_FOR_ROLE } from '../components/layout/navigation'
import Button from '../components/common/Button'
import { Input } from '../components/common/Field'
import { IconAlert, IconLock, IconUser } from '../components/common/Icons'
import { VendorByline } from '../components/common/Support'

export default function Login() {
  const { login, isAuthenticated, user, booting, sessionMessage, clearSessionMessage } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => clearSessionMessage, [clearSessionMessage])

  if (booting) return null
  if (isAuthenticated) {
    return <Navigate to={HOME_FOR_ROLE[user.role] || '/billing'} replace />
  }

  function validate() {
    const errors = {}
    if (!username.trim()) errors.username = 'Enter your username.'
    if (!password) errors.password = 'Enter your password.'
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  async function onSubmit(event) {
    event.preventDefault()
    setError(null)
    if (!validate()) return

    setSubmitting(true)
    try {
      const account = await login(username.trim(), password)
      // Role is detected from the account, never chosen at the login screen.
      const target = location.state?.from || HOME_FOR_ROLE[account.role] || '/billing'
      navigate(target, { replace: true })
    } catch (caught) {
      setError(caught.message || 'Could not sign in.')
      setPassword('')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden bg-ink-950 px-4 py-10">
      {/* warm brand wash */}
      <div
        className="pointer-events-none absolute inset-0 opacity-90"
        style={{
          background:
            'radial-gradient(1000px 620px at 15% -10%, #a1321c 0%, transparent 55%),' +
            'radial-gradient(820px 520px at 92% 108%, #b45309 0%, transparent 50%),' +
            'linear-gradient(160deg, #1a1917 0%, #2b2a28 100%)',
        }}
        aria-hidden="true"
      />

      <div className="relative w-full max-w-[26rem]">
        <div className="mb-7 text-center">
          <span className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-800 font-display text-xl font-bold text-white shadow-lift">
            AK
          </span>
          <h1 className="font-display text-[28px] font-bold tracking-tight text-white">
            Annapurna Kitchen
          </h1>
          <p className="mt-1 text-sm text-brand-200">Multi-cuisine restaurant · Billing system</p>
        </div>

        <form
          onSubmit={onSubmit}
          className="rounded-2xl border border-white/10 bg-white p-6 shadow-lift sm:p-7"
          noValidate
        >
          <h2 className="font-display text-lg font-bold text-ink-900">Sign in</h2>
          <p className="mb-5 mt-0.5 text-sm text-ink-500">
            Your access level is detected from your account.
          </p>

          {sessionMessage && !error && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] text-amber-900">
              <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
              {sessionMessage}
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-[13px] font-medium text-red-800"
            >
              <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div className="relative">
              <Input
                label="Username"
                value={username}
                autoComplete="username"
                autoFocus
                required
                error={fieldErrors.username}
                onChange={(event) => setUsername(event.target.value)}
                className="[&_input]:pl-10"
              />
              <IconUser className="pointer-events-none absolute left-3 top-[2.35rem] h-4 w-4 text-ink-400" />
            </div>

            <div className="relative">
              <Input
                label="Password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                autoComplete="current-password"
                required
                error={fieldErrors.password}
                onChange={(event) => setPassword(event.target.value)}
                className="[&_input]:pl-10 [&_input]:pr-16"
              />
              <IconLock className="pointer-events-none absolute left-3 top-[2.35rem] h-4 w-4 text-ink-400" />
              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                className="absolute right-3 top-[2.15rem] rounded px-1.5 py-1 text-[12px] font-bold uppercase tracking-wide text-ink-500 transition hover:text-brand-700"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <Button type="submit" size="lg" fullWidth loading={submitting} className="mt-6">
            {submitting ? 'Signing in…' : 'Sign in'}
          </Button>

          <p className="mt-5 text-center text-[12px] leading-relaxed text-ink-400">
            Accounts are provisioned during setup. Contact your administrator if you cannot
            sign in.
          </p>
        </form>

        <p className="mt-5 text-center text-[12px] text-brand-200/70">
          GST-compliant billing · Yield-based inventory · Offline-capable
        </p>

        <VendorByline className="mt-4 border-t border-white/10 pt-4" />
      </div>
    </div>
  )
}
