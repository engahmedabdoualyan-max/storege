import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { Layout } from './components/Layout'
import { useAuth, type Role } from './lib/auth'
import { Logo } from './components/Logo'

import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Items from './pages/Items'
import ItemDetail from './pages/ItemDetail'
import Inventory from './pages/Inventory'
import Totals from './pages/Totals'
import Locations from './pages/Locations'
import Receiving from './pages/Receiving'
import PurchaseOrderDetail from './pages/PurchaseOrderDetail'
import SalesOrders from './pages/SalesOrders'
import SalesOrderDetail from './pages/SalesOrderDetail'
import Picking from './pages/Picking'
import PickingSession from './pages/PickingSession'
import Shipping from './pages/Shipping'
import Transfers from './pages/Transfers'
import Counts from './pages/Counts'
import CountDetail from './pages/CountDetail'
import Partners from './pages/Partners'
import Invoices from './pages/Invoices'
import InvoiceView from './pages/InvoiceView'
import Reports from './pages/Reports'
import Reconciliation from './pages/Reconciliation'
import Docks from './pages/Docks'
import Returns from './pages/Returns'
import WavePicking from './pages/WavePicking'
import Labels from './pages/Labels'
import Users from './pages/Users'
import Settings from './pages/Settings'
import Audit from './pages/Audit'
import Integrations from './pages/Integrations'
import Manual from './pages/Manual'
import Handheld from './pages/Handheld'

function Splash() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-brand-950">
      <Logo light />
      <Loader2 className="animate-spin text-accent-400" size={22} />
    </div>
  )
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <Splash />
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />
  return <>{children}</>
}

function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { can } = useAuth()
  if (!can(...roles)) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/m"
        element={
          <RequireAuth>
            <Handheld />
          </RequireAuth>
        }
      />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/items" element={<Items />} />
        <Route path="/items/:id" element={<ItemDetail />} />
        <Route path="/inventory" element={<Inventory />} />
        <Route path="/totals" element={<Totals />} />
        <Route path="/locations" element={<Locations />} />
        <Route path="/receiving" element={<Receiving />} />
        <Route path="/receiving/:id" element={<PurchaseOrderDetail />} />
        <Route path="/sales-orders" element={<SalesOrders />} />
        <Route path="/sales-orders/:id" element={<SalesOrderDetail />} />
        <Route path="/picking" element={<Picking />} />
        <Route path="/wave-picking" element={<WavePicking />} />
        <Route path="/picking/:id" element={<PickingSession />} />
        <Route path="/shipping" element={<Shipping />} />
        <Route path="/transfers" element={<Transfers />} />
        <Route path="/docks" element={<Docks />} />
        <Route path="/counts" element={<Counts />} />
        <Route path="/counts/:id" element={<CountDetail />} />
        <Route path="/partners" element={<Partners />} />
        <Route path="/invoices" element={<Invoices />} />
        <Route path="/invoices/:id" element={<InvoiceView />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/reconciliation" element={<Reconciliation />} />
        <Route path="/returns" element={<Returns />} />
        <Route path="/labels" element={<Labels />} />
        <Route
          path="/users"
          element={
            <RequireRole roles={['ADMIN']}>
              <Users />
            </RequireRole>
          }
        />
        <Route
          path="/settings"
          element={
            <RequireRole roles={['ADMIN', 'MANAGER']}>
              <Settings />
            </RequireRole>
          }
        />
        <Route
          path="/audit"
          element={
            <RequireRole roles={['ADMIN', 'MANAGER']}>
              <Audit />
            </RequireRole>
          }
        />
        <Route
          path="/integrations"
          element={
            <RequireRole roles={['ADMIN', 'MANAGER']}>
              <Integrations />
            </RequireRole>
          }
        />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  )
}
