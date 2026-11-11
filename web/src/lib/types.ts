export type ListResponse<T> = { items: T[]; total: number; page: number; pageSize: number }

export type Category = {
  id: string
  name: string
  code: string
  color: string
  _count?: { items: number }
}

export type Item = {
  id: string
  sku: string
  name: string
  description?: string | null
  barcode?: string | null
  categoryId?: string | null
  category?: Category | null
  unit: string
  brand?: string | null
  cost: number
  price: number
  minStock: number
  strategicStock: number
  maxStock: number
  reorderQty: number
  shelfLifeDays: number
  trackLot: boolean
  trackSerial: boolean
  active: boolean
  imageUrl?: string | null
  onHand?: number
  reserved?: number
  available?: number
  lowStock?: boolean
  createdAt?: string
}

export type Warehouse = {
  id: string
  code: string
  name: string
  address?: string | null
  phone?: string | null
  manager?: string | null
  active: boolean
  createdAt?: string
  stats?: { onHand: number; reserved: number; value: number }
  _count?: { zones: number; locations: number }
}

export type Zone = {
  id: string
  warehouseId: string
  code: string
  name: string
  type: string
  warehouse?: Warehouse
  _count?: { locations: number }
}

export type Location = {
  id: string
  warehouseId: string
  zoneId?: string | null
  code: string
  barcode: string
  name?: string | null
  rack?: string | null
  column?: string | null
  type: string
  capacity?: number | null
  active: boolean
  zone?: Zone | null
  warehouse?: Warehouse
  _count?: { stocks: number }
  stocks?: StockRow[]
}

export type Lot = {
  id: string
  itemId: string
  code: string
  expiryDate?: string | null
  item?: Item
  stocks?: StockRow[]
  _count?: { stocks: number }
}

export type SerialRow = {
  id: string
  serial: string
  itemId: string
  lotId?: string | null
  lot?: Lot | null
  status: string
  createdAt: string
}

export type StockRow = {
  id: string
  key?: string
  itemId: string
  locationId: string
  lotId?: string | null
  serial?: string | null
  quantity: number
  reserved: number
  available: number
  value: number
  item: Item
  location: Location
  lot?: Lot | null
  updatedAt?: string
}

export type Partner = {
  id: string
  code: string
  name: string
  contact?: string | null
  phone?: string | null
  email?: string | null
  address?: string | null
  taxNumber?: string | null
  notes?: string | null
  active: boolean
  createdAt?: string
}

export type PurchaseOrderLine = {
  id: string
  poId?: string
  itemId: string
  item: Item
  qty: number
  receivedQty: number
  unitCost: number
}

export type ReceiptLine = {
  id: string
  receiptId?: string
  poLineId?: string | null
  itemId: string
  item: Item
  locationId?: string | null
  location?: Location | null
  lotCode?: string | null
  expiryDate?: string | null
  serials?: string | null
  qty: number
}

export type Receipt = {
  id: string
  number: string
  poId?: string | null
  warehouseId: string
  warehouse: Warehouse
  status: string
  notes?: string | null
  createdAt: string
  po?: (PurchaseOrder & { supplier?: Partner | null }) | null
  lines: ReceiptLine[]
}

export type PurchaseOrder = {
  id: string
  number: string
  supplierId?: string | null
  supplier?: Partner | null
  warehouseId: string
  warehouse: Warehouse
  status: string
  expectedAt?: string | null
  notes?: string | null
  subtotal: number
  taxRate: number
  taxAmount: number
  total: number
  createdAt: string
  updatedAt?: string
  lines: PurchaseOrderLine[]
  receipts?: Receipt[]
  _count?: { receipts: number }
}

export type Allocation = {
  id: string
  soId?: string
  soLineId: string
  itemId: string
  item: Item
  locationId: string
  location: Location
  lotId?: string | null
  lot?: Lot | null
  qty: number
  pickedQty: number
  status: string
  remaining?: number
}

export type SalesOrderLine = {
  id: string
  soId?: string
  itemId: string
  item: Item
  qty: number
  allocatedQty: number
  pickedQty: number
  packedQty: number
  unitPrice: number
  allocations?: Allocation[]
}

export type Shipment = {
  id: string
  soId: string
  carrier?: string | null
  tracking?: string | null
  notes?: string | null
  status: string
  shippedAt: string
  so?: SalesOrder
}

export type SalesOrder = {
  id: string
  number: string
  customerId?: string | null
  customer?: Partner | null
  warehouseId: string
  warehouse: Warehouse
  status: string
  priority: string
  notes?: string | null
  shipTo?: string | null
  subtotal: number
  taxRate: number
  taxAmount: number
  total: number
  createdAt: string
  updatedAt?: string
  shippedAt?: string | null
  lines: SalesOrderLine[]
  allocations?: Allocation[]
  tasks?: Allocation[]
  tasksRemaining?: number
  unitsRemaining?: number
  shipments?: Shipment[]
  invoices?: Invoice[]
}

export type InvoiceLine = {
  id: string
  invoiceId?: string
  itemId?: string | null
  item?: Item | null
  description: string
  qty: number
  unitPrice: number
  total: number
}

export type Invoice = {
  id: string
  number: string
  type: 'SALES' | 'PURCHASE'
  partnerType: 'CUSTOMER' | 'SUPPLIER'
  partnerId?: string | null
  partnerName: string
  refType?: string | null
  refId?: string | null
  date: string
  dueDate?: string | null
  subtotal: number
  taxRate: number
  taxAmount: number
  total: number
  paidAmount: number
  status: string
  notes?: string | null
  lines: InvoiceLine[]
}

export type TransferLine = {
  id: string
  transferId?: string
  itemId: string
  item: Item
  lotId?: string | null
  lot?: Lot | null
  fromLocationId?: string | null
  toLocationId?: string | null
  fromLocation?: Location | null
  toLocation?: Location | null
  qty: number
}

export type Transfer = {
  id: string
  number: string
  fromWarehouseId: string
  fromWarehouse: Warehouse
  toWarehouseId: string
  toWarehouse: Warehouse
  status: string
  notes?: string | null
  createdAt: string
  dispatchedAt?: string | null
  receivedAt?: string | null
  lines: TransferLine[]
}

export type CycleCountLine = {
  id: string
  countId?: string
  itemId: string
  item: Item
  locationId: string
  location: Location
  lotId?: string | null
  lot?: Lot | null
  expectedQty: number
  countedQty?: number | null
  variance?: number | null
}

export type CycleCount = {
  id: string
  number: string
  warehouseId: string
  warehouse: Warehouse
  scope: string
  locationId?: string | null
  itemId?: string | null
  status: string
  notes?: string | null
  createdAt: string
  completedAt?: string | null
  createdByName?: string | null
  lines: CycleCountLine[]
  _count?: { lines: number }
}

export type StockMovement = {
  id: string
  type: string
  itemId: string
  item: Item
  fromLocationId?: string | null
  fromLocation?: Location | null
  toLocationId?: string | null
  toLocation?: Location | null
  lotId?: string | null
  lot?: Lot | null
  qty: number
  refType?: string | null
  refId?: string | null
  userId?: string | null
  userName?: string | null
  note?: string | null
  createdAt: string
}

export type UserRow = {
  id: string
  name: string
  email: string
  role: 'ADMIN' | 'MANAGER' | 'OPERATOR' | 'VIEWER'
  phone?: string | null
  active: boolean
  lastLoginAt?: string | null
  createdAt?: string
}

export type Settings = Record<string, string | number | boolean | null>

export type ApiToken = {
  id: string
  name: string
  prefix: string
  scopes: string
  active: boolean
  lastUsedAt?: string | null
  createdAt: string
  token?: string
}

export type WebhookEndpoint = {
  id: string
  name: string
  url: string
  events: string
  secret: string
  active: boolean
  createdAt: string
  _count?: { deliveries: number }
}

export type AuditLog = {
  id: string
  userId?: string | null
  userName?: string | null
  action: string
  entity: string
  entityId?: string | null
  details?: string | null
  ip?: string | null
  createdAt: string
}

export type DashboardData = {
  kpis: {
    skuCount: number
    units: number
    reserved: number
    available: number
    stockValue: number
    itemCount: number
    lowStockCount: number
    strategicCount: number
    expiringCount: number
    openPurchaseOrders: number
    openSalesOrders: number
    pickingQueue: number
    readyToShip: number
    receivedToday: number
    pickedToday: number
    shippedToday: number
  }
  series: { date: string; in: number; out: number }[]
  byCategory: { name: string; value: number; qty: number; color: string }[]
  lowStock: { id: string; name: string; sku: string; minStock: number; strategicStock?: number; threshold: number; strategic: boolean; shortage: number; onHand: number }[]
  expiring: { id: string; code: string; expiryDate: string | null; item: Item; qty: number; location?: string }[]
  recent: StockMovement[]
}

export type PickingOrder = SalesOrder & {
  tasks: Allocation[]
  tasksRemaining: number
  unitsRemaining: number
}

export type PickingDetail = { order: SalesOrder; tasks: Allocation[] }

export type AggregateBucket = {
  id: string
  label: string
  color?: string
  skuCount: number
  units: number
  reserved: number
  available: number
  value: number
}

export type StrategicAlert = {
  id: string
  sku: string
  name: string
  unit: string
  onHand: number
  strategicStock: number
  minStock: number
  threshold: number
  shortage: number
  reorderQty: number
  cost: number
  severity: string
}

export type TotalsData = {
  overall: {
    skuCount: number
    activeItems: number
    unitCount: number
    reserved: number
    available: number
    stockValue: number
    warehouses: number
    locations: number
    strategicAlerts: number
  }
  byWarehouse: AggregateBucket[]
  byCategory: AggregateBucket[]
  strategic: StrategicAlert[]
}

export type ReconciliationRow = {
  id: string
  sku: string
  name: string
  unit: string
  category: string
  invoicedQty: number
  invoicedValue: number
  receivedQty: number
  onHandQty: number
  reservedQty: number
  soldQty: number
  variance: number
  invoices: number
  suppliers: string
  lastInvoiceDate: string | null
  status: string
  strategicStock: number
  minStock: number
}

export type ReconciliationData = {
  rows: ReconciliationRow[]
  totals: {
    items: number
    invoicedQty: number
    receivedQty: number
    onHandQty: number
    invoicedValue: number
    shortReceived: number
    notInStock: number
    noInvoice: number
    matched: number
  }
  invoices: {
    id: string
    number: string
    partnerName: string
    date: string
    total: number
    status: string
    lines: number
  }[]
}
