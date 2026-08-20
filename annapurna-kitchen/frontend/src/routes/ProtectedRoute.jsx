import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { HOME_FOR_ROLE } from '../components/layout/navigation'
import { Loader } from '../components/common/States'

/**
 * Frontend route guard. This hides screens a role cannot use; it is NOT the
 * security boundary. Every API route re-checks the role server-side, so a
 * cashier who types /reports into the address bar is refused by the backend
 * as well (07-Role-Access).
 */
export default function ProtectedRoute({ roles, children }) {
  const { isAuthenticated, booting, user } = useAuth()
  const location = useLocation()

  if (booting) {
    return (
      <div className="grid min-h-screen place-items-center bg-ink-50">
        <Loader label="Restoring your session…" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to={HOME_FOR_ROLE[user.role] || '/billing'} replace />
  }

  return children
}
