import { openDB, type IDBPDatabase } from 'idb'
import { request, getToken, api } from './api'

export type QueuedOp = {
  id: string
  method: string
  path: string
  body: unknown
  label: string
  createdAt: number
  attempts: number
  lastError?: string
}

export type Catalog = {
  savedAt: string
  items: CachedItem[]
  locations: CachedLocation[]
  warehouses: { id: string; code: string; name: string }[]
  purchaseOrders: CachedPO[]
  salesOrders: CachedSO[]
  putaway: CachedPutaway[]
  counts: CachedCount[]
}

export type CachedPutaway = {
  id: string
  itemId: string
  itemName: string
  sku: string
  barcode?: string | null
  locationId: string
  locationCode: string
  lotId?: string | null
  lotCode?: string | null
  quantity: number
}

export type CachedCountLine = {
  id: string
  itemId: string
  itemName: string
  sku: string
  barcode?: string | null
  locationId: string
  locationCode: string
  lotCode?: string | null
  expectedQty: number
  countedQty?: number | null
}

export type CachedCount = {
  id: string
  number: string
  warehouseId: string
  status: string
  lines: CachedCountLine[]
}

export type CachedItem = {
  id: string
  sku: string
  name: string
  barcode: string | null
  unit: string
  trackLot: boolean
  trackSerial: boolean
  onHand?: number
  price?: number
  stocks?: { locationId: string; locationCode?: string; locationName?: string; lotCode?: string | null; quantity: number }[]
}

export type CachedLocation = {
  id: string
  code: string
  barcode: string
  name: string | null
  type: string
  warehouseId: string
  warehouseName?: string
}

export type CachedPO = {
  id: string
  number: string
  supplierName?: string
  lines: { id: string; itemId: string; itemName: string; sku: string; qty: number; receivedQty: number }[]
}

export type CachedSO = {
  id: string
  number: string
  customerName?: string
  status: string
  allocations: {
    id: string
    soLineId: string
    itemId: string
    itemName: string
    sku: string
    locationId: string
    locationCode: string
    lotId?: string | null
    lotCode?: string | null
    qty: number
    pickedQty: number
  }[]
}

let dbPromise: Promise<IDBPDatabase> | null = null

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB('storege-offline', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('queue')) db.createObjectStore('queue', { keyPath: 'id' })
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv')
      },
    })
  }
  return dbPromise
}

function notify() {
  window.dispatchEvent(new CustomEvent('storege:queue'))
}

export async function enqueue(op: {
  id?: string
  method: string
  path: string
  body: unknown
  label: string
}) {
  const db = await getDb()
  const record: QueuedOp = {
    id: op.id || crypto.randomUUID(),
    method: op.method,
    path: op.path,
    body: op.body,
    label: op.label,
    createdAt: Date.now(),
    attempts: 0,
  }
  await db.put('queue', record)
  notify()
  return record
}

export async function getQueue(): Promise<QueuedOp[]> {
  const db = await getDb()
  const ops = (await db.getAll('queue')) as QueuedOp[]
  return ops.sort((a, b) => a.createdAt - b.createdAt)
}

export async function queueCount() {
  try {
    const db = await getDb()
    return await db.count('queue')
  } catch {
    return 0
  }
}

export async function clearQueue() {
  const db = await getDb()
  await db.clear('queue')
  notify()
}

export async function removeQueued(id: string) {
  const db = await getDb()
  await db.delete('queue', id)
  notify()
}

export type FlushResult = { sent: number; failed: number; errors: string[]; remaining: number }

let flushing = false

export async function flushQueue(): Promise<FlushResult> {
  if (flushing) return { sent: 0, failed: 0, errors: ['المزامنة جارية بالفعل'], remaining: await queueCount() }
  flushing = true
  const result: FlushResult = { sent: 0, failed: 0, errors: [], remaining: 0 }
  try {
    if (!navigator.onLine) {
      return { ...result, errors: ['لا يوجد اتصال بالإنترنت'], remaining: await queueCount() }
    }
    const ops = await getQueue()
    for (const op of ops) {
      try {
        await request(op.method, op.path, op.body, { opId: op.id, timeout: 30000 })
        await removeQueued(op.id)
        result.sent++
      } catch (error) {
        const status = (error as { status?: number }).status
        if (status && status >= 400 && status < 500) {
          await removeQueued(op.id)
          result.failed++
          result.errors.push(`${op.label}: ${(error as Error).message}`)
        } else {
          result.errors.push(`${op.label}: سيتم إعادة المحاولة`)
          break
        }
      }
    }
    result.remaining = await queueCount()
    return result
  } finally {
    flushing = false
    notify()
  }
}

/**
 * Runs a mutation online, or stores it locally when the network is unavailable.
 * Every queued operation carries a client id that the API uses for idempotent replay.
 */
export async function offlineMutate<T>(
  path: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  body: unknown,
  label: string,
): Promise<{ queued: boolean; data?: T; error?: string }> {
  const opId = crypto.randomUUID()
  if (navigator.onLine) {
    try {
      const data = await request<T>(method, path, body, { opId, timeout: 20000 })
      return { queued: false, data }
    } catch (error) {
      const status = (error as { status?: number }).status
      // 4xx responses are definitive (validation/auth); retrying them would only
      // create duplicates. Network failures and 5xx/408 (gateway down, timeout)
      // mean the server could not be reached, so keep the operation for later.
      if (status && status >= 400 && status < 500 && status !== 408) {
        return { queued: false, error: (error as Error).message }
      }
    }
  }
  await enqueue({ id: opId, method, path, body, label })
  return { queued: true }
}

// ---------------------------------------------------------------- catalog
export async function saveCatalog(userId?: string, warehouseId?: string) {
  type RawItem = CachedItem & { onHand?: number }
  type RawLocation = CachedLocation
  type RawPO = {
    id: string
    number: string
    supplier?: { name?: string }
    lines: { id: string; itemId: string; item?: { name?: string; sku?: string }; qty: number; receivedQty: number }[]
  }
  type RawSO = {
    id: string
    number: string
    status: string
    customer?: { name?: string }
    allocations: {
      id: string
      soLineId: string
      itemId: string
      item?: { name?: string; sku?: string }
      locationId: string
      location?: { code?: string }
      lotId?: string | null
      lot?: { code?: string } | null
      qty: number
      pickedQty: number
    }[]
  }
  type RawPutaway = {
    id: string
    itemId: string
    locationId: string
    quantity: number
    lotId?: string | null
    item?: { name?: string; sku?: string; barcode?: string | null }
    location?: { code?: string }
    lot?: { code?: string } | null
  }
  type RawCount = {
    id: string
    number: string
    warehouseId: string
    status: string
  }
  type RawCountDetail = RawCount & {
    lines: {
      id: string
      itemId: string
      locationId: string
      expectedQty: number
      countedQty?: number | null
      item?: { name?: string; sku?: string; barcode?: string | null }
      location?: { code?: string }
      lot?: { code?: string } | null
    }[]
  }
  const warehouseQuery = warehouseId ? `?warehouseId=${warehouseId}` : ''
  const [itemsRes, locations, warehouses, pos, sos, putawayRes, countsRes] = await Promise.all([
    api.get<{ items: RawItem[] }>('/api/items?pageSize=200&active=all'),
    api.get<RawLocation[]>(`/api/locations?all=1${warehouseId ? `&warehouseId=${warehouseId}` : ''}`),
    api.get<{ id: string; code: string; name: string }[]>('/api/warehouses'),
    api.get<{ items: RawPO[] }>('/api/purchase-orders?pageSize=100&status=OPEN'),
    api.get<RawSO[]>('/api/picking/queue'),
    api.get<{ items: RawPutaway[] }>(`/api/putaway/pending${warehouseQuery}`).catch(() => ({ items: [] })),
    api.get<{ items: RawCount[] }>('/api/cycle-counts?status=OPEN&pageSize=10').catch(() => ({ items: [] })),
  ])
  const countDetails = await Promise.all(
    countsRes.items.slice(0, 10).map((count) =>
      api.get<RawCountDetail>(`/api/cycle-counts/${count.id}`).catch(() => null),
    ),
  )
  const items: CachedItem[] = itemsRes.items.map((item) => ({
    id: item.id,
    sku: item.sku,
    name: item.name,
    barcode: item.barcode,
    unit: item.unit,
    trackLot: item.trackLot,
    trackSerial: item.trackSerial,
    onHand: item.onHand,
    price: item.price,
  }))
  const catalog: Catalog = {
    savedAt: new Date().toISOString(),
    items,
    locations,
    warehouses,
    purchaseOrders: pos.items.map((po) => ({
      id: po.id,
      number: po.number,
      supplierName: po.supplier?.name,
      lines: po.lines.map((line) => ({
        id: line.id,
        itemId: line.itemId,
        itemName: line.item?.name || '',
        sku: line.item?.sku || '',
        qty: line.qty,
        receivedQty: line.receivedQty,
      })),
    })),
    salesOrders: sos.map((so) => ({
      id: so.id,
      number: so.number,
      customerName: so.customer?.name,
      status: so.status,
      allocations: so.allocations.map((a) => ({
        id: a.id,
        soLineId: a.soLineId,
        itemId: a.itemId,
        itemName: a.item?.name || '',
        sku: a.item?.sku || '',
        locationId: a.locationId,
        locationCode: a.location?.code || '',
        lotId: a.lotId,
        lotCode: a.lot?.code,
        qty: a.qty,
        pickedQty: a.pickedQty,
      })),
    })),
    putaway: putawayRes.items.map((row) => ({
      id: row.id,
      itemId: row.itemId,
      itemName: row.item?.name || '',
      sku: row.item?.sku || '',
      barcode: row.item?.barcode || null,
      locationId: row.locationId,
      locationCode: row.location?.code || '',
      lotId: row.lotId || null,
      lotCode: row.lot?.code || null,
      quantity: row.quantity,
    })),
    counts: countDetails
      .filter((count): count is RawCountDetail => Boolean(count))
      .map((count) => ({
        id: count.id,
        number: count.number,
        warehouseId: count.warehouseId,
        status: count.status,
        lines: (count.lines || []).map((line) => ({
          id: line.id,
          itemId: line.itemId,
          itemName: line.item?.name || '',
          sku: line.item?.sku || '',
          barcode: line.item?.barcode || null,
          locationId: line.locationId,
          locationCode: line.location?.code || '',
          lotCode: line.lot?.code || null,
          expectedQty: line.expectedQty,
          countedQty: line.countedQty ?? null,
        })),
      })),
  }
  const db = await getDb()
  await db.put('kv', catalog, `catalog:${userId || 'shared'}`)
  return catalog
}

export async function getCatalog(userId?: string): Promise<Catalog | null> {
  try {
    const db = await getDb()
    return ((await db.get('kv', `catalog:${userId || 'shared'}`)) as Catalog) || null
  } catch {
    return null
  }
}

export async function findCached(code: string, userId?: string) {
  const catalog = await getCatalog(userId)
  if (!catalog) return null
  const clean = code.trim()
  const item = catalog.items.find(
    (i) => i.barcode === clean || i.sku.toLowerCase() === clean.toLowerCase(),
  )
  if (item) return { type: 'item' as const, item }
  const location = catalog.locations.find(
    (l) => l.barcode.toLowerCase() === clean.toLowerCase() || l.code.toLowerCase() === clean.toLowerCase(),
  )
  if (location) return { type: 'location' as const, location }
  const po = catalog.purchaseOrders.find((p) => p.number === clean)
  if (po) return { type: 'purchase_order' as const, purchaseOrder: po }
  return null
}

export function isOnline() {
  return navigator.onLine
}
