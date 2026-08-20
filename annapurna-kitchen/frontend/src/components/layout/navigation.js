import {
  IconBackup,
  IconBilling,
  IconDashboard,
  IconDiscount,
  IconExpense,
  IconInventory,
  IconMenuBook,
  IconReceipt,
  IconReports,
  IconSettings,
  IconTables,
  IconUsers,
} from '../common/Icons'

/**
 * Navigation, straight from the 07-Role-Access matrix.
 *
 * There is deliberately no Staff / Employees / Staff Accounts entry: staff
 * management is not part of this application. Accounts are provisioned by the
 * setup script.
 */
export const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: IconDashboard, roles: ['admin'] },
  { to: '/billing', label: 'Billing', icon: IconBilling, roles: ['admin', 'cashier'] },
  { to: '/tables', label: 'Tables', icon: IconTables, roles: ['admin', 'cashier'] },
  { to: '/bills', label: 'Bill History', icon: IconReceipt, roles: ['admin', 'cashier'] },
  { to: '/menu', label: 'Menu', icon: IconMenuBook, roles: ['admin'] },
  { to: '/inventory', label: 'Inventory', icon: IconInventory, roles: ['admin'] },
  { to: '/discounts', label: 'Discounts', icon: IconDiscount, roles: ['admin'] },
  { to: '/customers', label: 'Customers', icon: IconUsers, roles: ['admin', 'cashier'] },
  { to: '/expenses', label: 'Expenses', icon: IconExpense, roles: ['admin'] },
  { to: '/reports', label: 'Reports', icon: IconReports, roles: ['admin'] },
  { to: '/settings', label: 'Settings', icon: IconSettings, roles: ['admin'] },
  { to: '/backup', label: 'Backup & Export', icon: IconBackup, roles: ['admin'] },
]

export function navFor(role) {
  return NAV_ITEMS.filter((item) => item.roles.includes(role))
}

export const HOME_FOR_ROLE = {
  admin: '/dashboard',
  cashier: '/billing',
}
