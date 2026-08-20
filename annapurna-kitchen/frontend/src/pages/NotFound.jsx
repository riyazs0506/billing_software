import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { HOME_FOR_ROLE } from '../components/layout/navigation'
import Button from '../components/common/Button'

export default function NotFound() {
  const { user, isAuthenticated } = useAuth()
  const home = isAuthenticated ? HOME_FOR_ROLE[user?.role] || '/billing' : '/login'

  return (
    <div className="grid min-h-screen place-items-center bg-ink-50 px-4">
      <div className="text-center">
        <p className="font-display text-[72px] font-bold leading-none text-brand-200">404</p>
        <h1 className="mt-2 font-display text-2xl font-bold text-ink-900">Page not found</h1>
        <p className="mt-2 max-w-sm text-sm text-ink-500">
          That screen does not exist in Annapurna Kitchen, or your role does not have access
          to it.
        </p>
        <Link to={home} className="mt-6 inline-block">
          <Button size="lg">Back to {isAuthenticated ? 'the app' : 'sign in'}</Button>
        </Link>
      </div>
    </div>
  )
}
