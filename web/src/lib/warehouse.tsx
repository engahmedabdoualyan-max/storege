import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from './api'
import { useAuth } from './auth'

export type Warehouse = {
  id: string
  code: string
  name: string
  address?: string | null
  active: boolean
}

type WarehouseContextValue = {
  warehouses: Warehouse[]
  warehouseId: string
  warehouse: Warehouse | null
  setWarehouseId: (id: string) => void
  loading: boolean
}

const WarehouseContext = createContext<WarehouseContextValue | null>(null)

export function WarehouseProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [warehouseId, setWarehouseIdState] = useState(() => localStorage.getItem('storege_warehouse') || '')
  const { data, isLoading } = useQuery({
    queryKey: ['warehouses'],
    queryFn: () => api.get<Warehouse[]>('/api/warehouses'),
    staleTime: 60_000,
    enabled: Boolean(user),
  })
  const warehouses = useMemo(() => (data || []).filter((warehouse) => warehouse.active), [data])

  useEffect(() => {
    if (!warehouseId && warehouses.length) setWarehouseIdState(warehouses[0].id)
    if (warehouseId && warehouses.length && !warehouses.some((w) => w.id === warehouseId)) {
      setWarehouseIdState(warehouses[0].id)
    }
  }, [warehouseId, warehouses])

  const setWarehouseId = (id: string) => {
    setWarehouseIdState(id)
    localStorage.setItem('storege_warehouse', id)
  }

  const value = useMemo(
    () => ({
      warehouses,
      warehouseId,
      warehouse: warehouses.find((w) => w.id === warehouseId) || null,
      setWarehouseId,
      loading: isLoading,
    }),
    [warehouses, warehouseId, isLoading],
  )

  return <WarehouseContext.Provider value={value}>{children}</WarehouseContext.Provider>
}

export function useWarehouse() {
  const context = useContext(WarehouseContext)
  if (!context) throw new Error('useWarehouse must be used inside WarehouseProvider')
  return context
}
