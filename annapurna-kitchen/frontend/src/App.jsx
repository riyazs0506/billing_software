import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ToastProvider } from './context/ToastContext'
import { AppDataProvider } from './context/AppDataContext'
import ProtectedRoute from './routes/ProtectedRoute'
import AppShell from './components/layout/AppShell'
import { HOME_FOR_ROLE } from './components/layout/navigation'

import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import BillingScreen from './pages/BillingScreen'
import TableView from './pages/TableView'
import BillHistory from './pages/BillHistory'
import MenuManagement from './pages/MenuManagement'
import InventoryDashboard from './pages/InventoryDashboard'
import Discounts from './pages/Discounts'
import Customers from './pages/Customers'
import Expenses from './pages/Expenses'
import Reports from './pages/Reports'
import Settings from './pages/Settings'
import BackupExport from './pages/BackupExport'
import NotFound from './pages/NotFound'

const ADMIN = ['admin']
const BOTH = ['admin', 'cashier']

function shell(element, roles) {
  return (
    <ProtectedRoute roles={roles}>
      <AppShell>{element}</AppShell>
    </ProtectedRoute>
  )
}

function HomeRedirect() {
  const { user, isAuthenticated, booting } = useAuth()
  if (booting) return null
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <Navigate to={HOME_FOR_ROLE[user.role] || '/billing'} replace />
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<HomeRedirect />} />

      {/* Cashier + Admin */}
      <Route path="/billing" element={shell(<BillingScreen />, BOTH)} />
      <Route path="/billing/:orderId" element={shell(<BillingScreen />, BOTH)} />
      <Route path="/tables" element={shell(<TableView />, BOTH)} />
      <Route path="/bills" element={shell(<BillHistory />, BOTH)} />
      <Route path="/customers" element={shell(<Customers />, BOTH)} />

      {/* Admin only */}
      <Route path="/dashboard" element={shell(<Dashboard />, ADMIN)} />
      <Route path="/menu" element={shell(<MenuManagement />, ADMIN)} />
      <Route path="/inventory" element={shell(<InventoryDashboard />, ADMIN)} />
      <Route path="/discounts" element={shell(<Discounts />, ADMIN)} />
      <Route path="/expenses" element={shell(<Expenses />, ADMIN)} />
      <Route path="/reports" element={shell(<Reports />, ADMIN)} />
      <Route path="/settings" element={shell(<Settings />, ADMIN)} />
      <Route path="/backup" element={shell(<BackupExport />, ADMIN)} />

      {/*
        No /staff, /staff-management, /employees route exists anywhere in this
        application - staff management is out of scope by design.
      */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <AppDataProvider>
          <AppRoutes />
          {/* Staging area the browser print path renders into. */}
          <div className="print-area print-only" id="print-root" />
        </AppDataProvider>
      </AuthProvider>
    </ToastProvider>
  )
}
