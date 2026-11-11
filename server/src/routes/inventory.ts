import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { audit } from '../lib/audit.js'
import { ApiError, num, pagination, parse, str } from '../lib/http.js'
import { canWrite } from '../lib/auth.js'
import { adjustStock, consumeAt, moveStock } from '../lib/inventory.js'
import { emitEvent } from '../lib/webhooks.js'
import { getSettings } from '../lib/settings.js'

export async function inventoryRoutes(app: FastifyInstance) {
  app.get('/api/inventory', async (req) => {
    const q = req.query as Record<string, string>
    const { page, pageSize, skip, take } = pagination(q)
    const locationWhere: Record<string, unknown> = {}
    if (q.warehouseId) locationWhere.warehouseId = q.warehouseId
    if (q.locationId) locationWhere.id = q.locationId
    const where: Record<string, unknown> = {}
    if (Object.keys(locationWhere).length) where.location = locationWhere
    if (q.itemId) where.itemId = q.itemId
    if (q.lotCode) where.lot = { code: q.lotCode }
    if (q.q) {
      where.item = {
        OR: [{ name: { contains: q.q } }, { sku: { contains: q.q } }, { barcode: { contains: q.q } }],
      }
    }
    if (q.expiringDays) {
      const days = Number(q.expiringDays)
      const until = new Date()
      until.setDate(until.getDate() + days)
      where.lot = { expiryDate: { lte: until } }
      where.quantity = { gt: 0 }
    }
    if (q.lowStock === '1') {
      const settings = await getSettings()
      const items = await prisma.item.findMany({
        where: { active: true, minStock: { gt: 0 } },
        select: { id: true, minStock: true },
      })
      const grouped = await prisma.stock.findMany({ select: { itemId: true, quantity: true } })
      const totals = new Map<string, number>()
      for (const row of grouped) totals.set(row.itemId, (totals.get(row.itemId) || 0) + row.quantity)
      const lowIds = items
        .filter((i) => (totals.get(i.id) || 0) < i.minStock)
        .map((i) => i.id)
      where.itemId = { in: lowIds }
      void settings
    }
    if (q.available === '1') where.quantity = { gt: 0 }

    const [all, total] = await Promise.all([
      prisma.stock.findMany({
        where,
        include: {
          item: { include: { category: true } },
          location: { include: { warehouse: true, zone: true } },
          lot: true,
        },
        orderBy: [{ location: { code: 'asc' } }, { item: { name: 'asc' } }],
      }),
      prisma.stock.count({ where }),
    ])
    const totals = all.reduce(
      (acc, row) => {
        acc.quantity += row.quantity
        acc.reserved += row.reserved
        acc.value += row.quantity * row.item.cost
        return acc
      },
      { quantity: 0, reserved: 0, value: 0 },
    )
    const items = all.slice(skip, skip + take).map((row) => ({
      ...row,
      available: Math.round((row.quantity - row.reserved) * 1000) / 1000,
      value: Math.round(row.quantity * row.item.cost * 100) / 100,
    }))
    return {
      items,
      total,
      page,
      pageSize,
      totals: {
        quantity: Math.round(totals.quantity * 1000) / 1000,
        reserved: Math.round(totals.reserved * 1000) / 1000,
        value: Math.round(totals.value * 100) / 100,
      },
    }
  })

  app.get('/api/inventory/movements', async (req) => {
    const q = req.query as Record<string, string>
    const { page, pageSize, skip, take } = pagination(q)
    const where: Record<string, unknown> = {}
    if (q.itemId) where.itemId = q.itemId
    if (q.type) where.type = q.type
    if (q.userId) where.userId = q.userId
    if (q.from || q.to) {
      where.createdAt = {
        ...(q.from ? { gte: new Date(q.from) } : {}),
        ...(q.to ? { lte: new Date(new Date(q.to).setHours(23, 59, 59, 999)) } : {}),
      }
    }
    if (q.warehouseId) {
      where.OR = [
        { fromLocation: { warehouseId: q.warehouseId } },
        { toLocation: { warehouseId: q.warehouseId } },
      ]
    }
    if (q.q) {
      where.item = {
        OR: [{ name: { contains: q.q } }, { sku: { contains: q.q } }, { barcode: { contains: q.q } }],
      }
    }
    const [items, total] = await Promise.all([
      prisma.stockMovement.findMany({
        where,
        include: {
          item: true,
          fromLocation: { include: { warehouse: true } },
          toLocation: { include: { warehouse: true } },
          lot: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.stockMovement.count({ where }),
    ])
    return { items, total, page, pageSize }
  })

  app.get('/api/inventory/summary', async (req) => {
    const warehouseId = str((req.query as Record<string, string>).warehouseId)
    const stockWhere = warehouseId ? { location: { warehouseId } } : {}
    const stocks = await prisma.stock.findMany({
      where: stockWhere,
      include: { item: { select: { cost: true, minStock: true, strategicStock: true, id: true, name: true, sku: true } }, lot: true },
    })
    const byItem = new Map<string, { qty: number; reserved: number; value: number; min: number; strategic: number; name: string; sku: string }>()
    for (const row of stocks) {
      const current = byItem.get(row.itemId) || {
        qty: 0,
        reserved: 0,
        value: 0,
        min: row.item.minStock,
        strategic: row.item.strategicStock,
        name: row.item.name,
        sku: row.item.sku,
      }
      current.qty += row.quantity
      current.reserved += row.reserved
      current.value += row.quantity * row.item.cost
      byItem.set(row.itemId, current)
    }
    const threshold = (i: { strategic: number; min: number }) => (i.strategic > 0 ? i.strategic : i.min)
    const lowStock = [...byItem.values()].filter((i) => threshold(i) > 0 && i.qty < threshold(i))
    const strategic = lowStock.filter((i) => i.strategic > 0)
    const soon = new Date()
    soon.setDate(soon.getDate() + 30)
    const expiring = stocks.filter(
      (s) => s.quantity > 0 && s.lot?.expiryDate && s.lot.expiryDate <= soon,
    )
    return {
      skuCount: byItem.size,
      unitCount: Math.round(stocks.reduce((s, r) => s + r.quantity, 0) * 1000) / 1000,
      reserved: Math.round(stocks.reduce((s, r) => s + r.reserved, 0) * 1000) / 1000,
      available: Math.round(stocks.reduce((s, r) => s + r.quantity - r.reserved, 0) * 1000) / 1000,
      stockValue: Math.round(stocks.reduce((s, r) => s + r.quantity * r.item.cost, 0) * 100) / 100,
      lowStockCount: lowStock.length,
      strategicCount: strategic.length,
      lowStock: lowStock.slice(0, 10),
      expiringCount: expiring.length,
    }
  })

  // Putaway suggestion: consolidate into existing stock, else least-used pick location.
  app.get('/api/putaway/suggest', async (req) => {
    const q = req.query as Record<string, string>
    const itemId = str(q.itemId)
    const warehouseId = str(q.warehouseId)
    if (!itemId || !warehouseId) throw new ApiError(400, 'itemId و warehouseId مطلوبان')
    const existing = await prisma.stock.findFirst({
      where: { itemId, location: { warehouseId } },
      orderBy: { quantity: 'desc' },
      include: { location: true },
    })
    if (existing && existing.quantity > 0) {
      return { locationId: existing.locationId, locationCode: existing.location.code, reason: 'consolidate' }
    }
    const locations = await prisma.location.findMany({
      where: { warehouseId, type: 'PICK', active: true },
      orderBy: { code: 'asc' },
    })
    if (!locations.length) throw new ApiError(404, 'لا توجد مواقع متاحة')
    const counts = await prisma.stock.groupBy({
      by: ['locationId'],
      where: { location: { warehouseId } },
      _count: { _all: true },
    })
    const countMap = new Map(counts.map((c) => [c.locationId, c._count._all]))
    const sorted = [...locations].sort((a, b) => (countMap.get(a.id) || 0) - (countMap.get(b.id) || 0))
    return { locationId: sorted[0].id, locationCode: sorted[0].code, reason: 'empty' }
  })

  // Replenishment suggestions: move stock from bulk/reserve to pick face.
  app.get('/api/replenishment', async (req) => {
    const q = req.query as Record<string, string>
    const warehouseId = str(q.warehouseId)
    if (!warehouseId) throw new ApiError(400, 'warehouseId مطلوب')
    const items = await prisma.item.findMany({ where: { active: true, minStock: { gt: 0 } } })
    const stocks = await prisma.stock.findMany({ where: { location: { warehouseId } }, include: { location: true } })
    const totals = new Map<string, number>()
    for (const s of stocks) totals.set(s.itemId, (totals.get(s.itemId) || 0) + s.quantity)
    const locations = await prisma.location.findMany({ where: { warehouseId, type: 'PICK', active: true }, orderBy: { code: 'asc' } })
    const counts = await prisma.stock.groupBy({ by: ['locationId'], where: { location: { warehouseId } }, _count: { _all: true } })
    const countMap = new Map(counts.map((c) => [c.locationId, c._count._all]))
    const sortedLocs = [...locations].sort((a, b) => (countMap.get(a.id) || 0) - (countMap.get(b.id) || 0))
    const toLoc = sortedLocs[0]
    const suggestions = []
    for (const item of items) {
      const onHand = totals.get(item.id) || 0
      if (onHand >= item.minStock) continue
      const itemStocks = stocks.filter((s) => s.itemId === item.id && s.quantity > 0)
      if (!itemStocks.length || !toLoc) continue
      const shortage = Math.max(0, item.minStock - onHand)
      suggestions.push({
        itemId: item.id,
        sku: item.sku,
        name: item.name,
        unit: item.unit,
        onHand,
        minStock: item.minStock,
        shortage,
        qty: shortage || item.reorderQty || 1,
        fromLocationId: itemStocks[0].locationId,
        fromLocationCode: itemStocks[0].location.code,
        toLocationId: toLoc.id,
        toLocationCode: toLoc.code,
      })
    }
    return { suggestions, count: suggestions.length }
  })

  // ATP (Available to Promise): on-hand + inbound PO - reserved.
  app.get('/api/atp/:itemId', async (req) => {
    const { itemId } = req.params as { itemId: string }
    const q = req.query as Record<string, string>
    const warehouseId = str(q.warehouseId)
    const item = await prisma.item.findUnique({ where: { id: itemId } })
    if (!item) throw new ApiError(404, 'الصنف غير موجود')
    const stocks = await prisma.stock.findMany({ where: { itemId, ...(warehouseId ? { location: { warehouseId } } : {}) } })
    const onHand = stocks.reduce((s, r) => s + r.quantity, 0)
    const reserved = stocks.reduce((s, r) => s + r.reserved, 0)
    const poLines = await prisma.purchaseOrderLine.findMany({
      where: { itemId, po: { status: { in: ['OPEN', 'PARTIAL'] }, ...(warehouseId ? { warehouseId } : {}) } },
      include: { po: true },
    })
    const inbound = poLines.reduce((s, l) => s + (l.qty - l.receivedQty), 0)
    const atp = Math.max(0, onHand - reserved + inbound)
    return { itemId, sku: item.sku, name: item.name, onHand, reserved, available: onHand - reserved, inbound, atp }
  })

  // Simple demand forecast (moving average of shipped qty).
  app.get('/api/forecast/:itemId', async (req) => {
    const { itemId } = req.params as { itemId: string }
    const movements = await prisma.stockMovement.findMany({
      where: { itemId, type: 'SHIP' },
      orderBy: { createdAt: 'desc' },
      take: 90,
    })
    const totalShipped = movements.reduce((s, m) => s + m.qty, 0)
    const days = 90
    const avgDaily = totalShipped / days
    const item = await prisma.item.findUnique({ where: { id: itemId } })
    if (!item) throw new ApiError(404, 'الصنف غير موجود')
    const suggestedReorder = Math.ceil(avgDaily * (item.shelfLifeDays || 30))
    const suggestedMin = Math.ceil(avgDaily * 14)
    return { itemId, sku: item.sku, name: item.name, totalShipped90d: totalShipped, avgDailyDemand: Math.round(avgDaily * 1000) / 1000, suggestedReorderQty: suggestedReorder, suggestedMinStock: suggestedMin }
  })

  // Aggregated "total goods" view (whole company, per warehouse and per category).
  app.get('/api/inventory/totals', async (req) => {
    const q = req.query as Record<string, string>
    const stocks = await prisma.stock.findMany({
      where: q.warehouseId ? { location: { warehouseId: q.warehouseId } } : {},
      include: {
        item: { include: { category: true } },
        location: { include: { warehouse: true } },
      },
    })
    const items = await prisma.item.findMany({
      where: { active: true },
      select: { id: true, sku: true, name: true, unit: true, minStock: true, strategicStock: true, reorderQty: true, cost: true },
    })
    const warehouses = await prisma.warehouse.findMany({ orderBy: { createdAt: 'asc' } })
    const locations = await prisma.location.findMany({ where: { active: true }, select: { id: true, warehouseId: true } })

    type Bucket = { key: string; label: string; color?: string; skuIds: Set<string>; units: number; reserved: number; value: number }
    const makeBucket = (key: string, label: string, color?: string): Bucket => ({
      key,
      label,
      color,
      skuIds: new Set(),
      units: 0,
      reserved: 0,
      value: 0,
    })
    const warehouseBucket = new Map<string, Bucket>()
    for (const w of warehouses) warehouseBucket.set(w.id, makeBucket(w.id, `${w.name} (${w.code})`))
    const categoryBucket = new Map<string, Bucket>()
    const itemQty = new Map<string, number>()

    for (const row of stocks) {
      const value = row.quantity * row.item.cost
      itemQty.set(row.itemId, (itemQty.get(row.itemId) || 0) + row.quantity)
      const wb = warehouseBucket.get(row.location.warehouseId) || makeBucket(row.location.warehouseId, row.location.warehouse?.name || '')
      wb.skuIds.add(row.itemId)
      wb.units += row.quantity
      wb.reserved += row.reserved
      wb.value += value
      warehouseBucket.set(row.location.warehouseId, wb)
      const cat = row.item.category
      const ckey = cat?.id || 'none'
      const cb = categoryBucket.get(ckey) || makeBucket(ckey, cat?.name || 'غير مصنف', cat?.color || '#94a3b8')
      cb.skuIds.add(row.itemId)
      cb.units += row.quantity
      cb.reserved += row.reserved
      cb.value += value
      categoryBucket.set(ckey, cb)
    }

    const fmtBucket = (b: Bucket) => ({
      id: b.key,
      label: b.label,
      color: b.color,
      skuCount: b.skuIds.size,
      units: Math.round(b.units * 1000) / 1000,
      reserved: Math.round(b.reserved * 1000) / 1000,
      available: Math.round((b.units - b.reserved) * 1000) / 1000,
      value: Math.round(b.value * 100) / 100,
    })

    const strategic = items
      .map((item) => {
        const onHand = Math.round((itemQty.get(item.id) || 0) * 1000) / 1000
        const threshold = item.strategicStock > 0 ? item.strategicStock : item.minStock
        const shortage = Math.round(Math.max(0, threshold - onHand) * 1000) / 1000
        const ratio = threshold > 0 ? onHand / threshold : 1
        return {
          id: item.id,
          sku: item.sku,
          name: item.name,
          unit: item.unit,
          onHand,
          strategicStock: item.strategicStock,
          minStock: item.minStock,
          threshold,
          shortage,
          reorderQty: item.reorderQty || shortage,
          cost: item.cost,
          severity: shortage <= 0 ? 'ok' : ratio < 0.5 ? 'critical' : ratio < 0.85 ? 'warning' : 'watch',
        }
      })
      .filter((row) => row.threshold > 0 && row.shortage > 0)
      .sort((a, b) => b.shortage / (b.threshold || 1) - a.shortage / (a.threshold || 1))

    return {
      overall: {
        skuCount: new Set(stocks.map((s) => s.itemId)).size,
        activeItems: items.length,
        unitCount: Math.round(stocks.reduce((s, r) => s + r.quantity, 0) * 1000) / 1000,
        reserved: Math.round(stocks.reduce((s, r) => s + r.reserved, 0) * 1000) / 1000,
        available: Math.round(stocks.reduce((s, r) => s + r.quantity - r.reserved, 0) * 1000) / 1000,
        stockValue: Math.round(stocks.reduce((s, r) => s + r.quantity * r.item.cost, 0) * 100) / 100,
        warehouses: warehouses.length,
        locations: locations.length,
        strategicAlerts: strategic.length,
      },
      byWarehouse: [...warehouseBucket.values()].map(fmtBucket).sort((a, b) => b.value - a.value),
      byCategory: [...categoryBucket.values()].map(fmtBucket).sort((a, b) => b.value - a.value),
      strategic,
    }
  })

  app.post('/api/inventory/adjust', { preHandler: [canWrite] }, async (req) => {
    const body = parse(
      z.object({
        itemId: z.string(),
        locationId: z.string(),
        qty: z.coerce.number().refine((n) => n !== 0, 'الكمية لا يمكن أن تكون صفرًا'),
        lotCode: z.string().optional().nullable(),
        expiryDate: z.string().optional().nullable(),
        serials: z.array(z.string()).optional(),
        reason: z.string().min(2),
      }),
      req.body,
    )
    const settings = await getSettings()
    const result = await prisma.$transaction(async (tx) => {
      await adjustStock(tx, {
        itemId: body.itemId,
        locationId: body.locationId,
        qty: body.qty,
        lotCode: body.lotCode,
        expiryDate: body.expiryDate,
        serials: body.serials,
        allowNegative: settings.allowNegativeStock === 'true',
      })
      const item = await tx.item.findUnique({ where: { id: body.itemId } })
      const lot = body.lotCode
        ? await tx.lot.findUnique({
            where: { itemId_code: { itemId: body.itemId, code: body.lotCode } },
          })
        : null
      await tx.stockMovement.create({
        data: {
          type: 'ADJUST',
          itemId: body.itemId,
          fromLocationId: body.qty < 0 ? body.locationId : null,
          toLocationId: body.qty > 0 ? body.locationId : null,
          lotId: lot?.id || null,
          qty: Math.abs(body.qty),
          refType: 'ADJUSTMENT',
          userId: req.auth!.id,
          userName: req.auth!.name,
          note: body.reason,
        },
      })
      return { item: item?.name, sku: item?.sku }
    })
    await audit(req, 'ADJUST', 'Stock', body.itemId, body)
    await emitEvent('stock.adjusted', { ...body, ...result, user: req.auth!.name })
    return { ok: true, ...result }
  })

  app.post('/api/inventory/move', { preHandler: [canWrite] }, async (req) => {
    const body = parse(
      z.object({
        itemId: z.string(),
        fromLocationId: z.string(),
        toLocationId: z.string(),
        qty: z.coerce.number().positive(),
        lotId: z.string().optional().nullable(),
        lotCode: z.string().optional().nullable(),
        serial: z.string().optional().nullable(),
        note: z.string().optional(),
      }),
      req.body,
    )
    if (body.fromLocationId === body.toLocationId) throw new ApiError(400, 'الموقعان متطابقان')
    let lotId = body.lotId || null
    if (!lotId && body.lotCode) {
      const lot = await prisma.lot.findUnique({
        where: { itemId_code: { itemId: body.itemId, code: body.lotCode } },
      })
      if (!lot) throw new ApiError(404, 'الدفعة غير موجودة')
      lotId = lot.id
    }
    const from = await prisma.location.findUnique({ where: { id: body.fromLocationId } })
    const to = await prisma.location.findUnique({ where: { id: body.toLocationId } })
    if (!from || !to) throw new ApiError(404, 'أحد المواقع غير موجود')
    const type = from.warehouseId === to.warehouseId ? 'PUTAWAY' : 'TRANSFER'
    const chunks = await prisma.$transaction(async (tx) =>
      moveStock(tx, {
        itemId: body.itemId,
        fromLocationId: body.fromLocationId,
        toLocationId: body.toLocationId,
        qty: body.qty,
        lotId,
        serial: body.serial,
        type,
        refType: type,
        userId: req.auth!.id,
        userName: req.auth!.name,
        note: body.note,
      }),
    )
    await audit(req, 'MOVE', 'Stock', body.itemId, body)
    await emitEvent('stock.moved', { ...body, chunks })
    return { ok: true, chunks }
  })

  app.get('/api/lots', async (req) => {
    const q = req.query as Record<string, string>
    const lots = await prisma.lot.findMany({
      where: q.itemId ? { itemId: q.itemId } : {},
      include: { item: true, _count: { select: { stocks: true } } },
      orderBy: { expiryDate: 'asc' },
      take: 200,
    })
    return lots
  })

  app.get('/api/serials', async (req) => {
    const q = req.query as Record<string, string>
    const { page, pageSize, skip, take } = pagination(q)
    const where: Record<string, unknown> = {}
    if (q.itemId) where.itemId = q.itemId
    if (q.status) where.status = q.status
    if (q.q) where.serial = { contains: q.q }
    const [items, total] = await Promise.all([
      prisma.serial.findMany({
        where,
        include: { item: true, lot: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.serial.count({ where }),
    ])
    return { items, total, page, pageSize }
  })
}
