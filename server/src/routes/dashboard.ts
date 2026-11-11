import type { FastifyInstance } from 'fastify'
import { prisma } from '../lib/prisma.js'
import { round3 } from '../lib/inventory.js'

export async function dashboardRoutes(app: FastifyInstance) {
  app.get('/api/dashboard', async (req) => {
    const warehouseId = (req.query as Record<string, string>).warehouseId
    const stockWhere = warehouseId ? { location: { warehouseId } } : {}
    const orderWhere = warehouseId ? { warehouseId } : {}
    const start = new Date()
    start.setDate(start.getDate() - 13)
    start.setHours(0, 0, 0, 0)
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const [stocks, movements, openPos, openSos, picking, packed, recent, expiredLots, items] =
      await Promise.all([
        prisma.stock.findMany({
          where: stockWhere,
          include: { item: { include: { category: true } }, lot: true },
        }),
        prisma.stockMovement.findMany({
          where: {
            createdAt: { gte: start },
            ...(warehouseId
              ? { OR: [{ fromLocation: { warehouseId } }, { toLocation: { warehouseId } }] }
              : {}),
          },
          select: { type: true, qty: true, createdAt: true, itemId: true, fromLocationId: true, toLocationId: true },
        }),
        prisma.purchaseOrder.count({
          where: { ...orderWhere, status: { in: ['OPEN', 'PARTIAL'] } },
        }),
        prisma.salesOrder.count({
          where: { ...orderWhere, status: { in: ['OPEN', 'ALLOCATED', 'PICKING', 'PICKED', 'PACKED'] } },
        }),
        prisma.salesOrder.count({ where: { ...orderWhere, status: { in: ['ALLOCATED', 'PICKING'] } } }),
        prisma.salesOrder.count({ where: { ...orderWhere, status: 'PACKED' } }),
        prisma.stockMovement.findMany({
          include: { item: true, fromLocation: true, toLocation: true, lot: true },
          orderBy: { createdAt: 'desc' },
          take: 12,
          ...(warehouseId
            ? { where: { OR: [{ fromLocation: { warehouseId } }, { toLocation: { warehouseId } }] } }
            : {}),
        }),
        prisma.lot.findMany({
          where: {
            expiryDate: { lte: new Date(Date.now() + 1000 * 60 * 60 * 24 * 45) },
            stocks: { some: { quantity: { gt: 0 }, ...stockWhere } },
          },
          include: { item: true, stocks: { include: { location: true }, where: { quantity: { gt: 0 } } } },
          orderBy: { expiryDate: 'asc' },
          take: 8,
        }),
        prisma.item.findMany({
          where: { active: true },
          select: { id: true, name: true, sku: true, minStock: true, strategicStock: true, cost: true },
        }),
      ])

    const totalQty = stocks.reduce((s, r) => s + r.quantity, 0)
    const totalReserved = stocks.reduce((s, r) => s + r.reserved, 0)
    const stockValue = stocks.reduce((s, r) => s + r.quantity * r.item.cost, 0)

    const byItem = new Map<string, number>()
    for (const row of stocks) byItem.set(row.itemId, (byItem.get(row.itemId) || 0) + row.quantity)
    const thresholdOf = (i: { minStock: number; strategicStock: number }) =>
      i.strategicStock > 0 ? i.strategicStock : i.minStock
    const lowStock = items
      .filter((i) => thresholdOf(i) > 0 && (byItem.get(i.id) || 0) < thresholdOf(i))
      .map((i) => ({
        ...i,
        threshold: thresholdOf(i),
        strategic: i.strategicStock > 0,
        shortage: round3(Math.max(0, thresholdOf(i) - (byItem.get(i.id) || 0))),
        onHand: round3(byItem.get(i.id) || 0),
      }))
      .sort((a, b) => a.onHand / (a.threshold || 1) - b.onHand / (b.threshold || 1))
      .slice(0, 8)

    const seriesMap = new Map<string, { in: number; out: number }>()
    for (let i = 0; i < 14; i++) {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      seriesMap.set(d.toISOString().slice(0, 10), { in: 0, out: 0 })
    }
    const inbound = new Set(['RECEIVE', 'TRANSFER_IN', 'RETURN'])
    const outbound = new Set(['SHIP', 'TRANSFER_OUT', 'PICK'])
    for (const m of movements) {
      const key = m.createdAt.toISOString().slice(0, 10)
      const bucket = seriesMap.get(key)
      if (!bucket) continue
      if (inbound.has(m.type) || (m.type === 'ADJUST' && m.toLocationId)) bucket.in += m.qty
      else if (outbound.has(m.type) || (m.type === 'ADJUST' && m.fromLocationId)) bucket.out += m.qty
    }
    const series = [...seriesMap.entries()].map(([date, v]) => ({
      date,
      in: round3(v.in),
      out: round3(v.out),
    }))

    const categoryMap = new Map<string, { name: string; value: number; qty: number; color: string }>()
    for (const row of stocks) {
      const category = row.item.category
      const key = category?.id || 'none'
      const entry = categoryMap.get(key) || {
        name: category?.name || 'غير مصنف',
        value: 0,
        qty: 0,
        color: category?.color || '#94a3b8',
      }
      entry.value += row.quantity * row.item.cost
      entry.qty += row.quantity
      categoryMap.set(key, entry)
    }
    const byCategory = [...categoryMap.values()]
      .map((c) => ({ ...c, value: Math.round(c.value * 100) / 100, qty: round3(c.qty) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8)

    const todayMoves = await prisma.stockMovement.findMany({
      where: { createdAt: { gte: today } },
      select: { type: true },
    })

    return {
      kpis: {
        skuCount: byItem.size,
        units: round3(totalQty),
        reserved: round3(totalReserved),
        available: round3(totalQty - totalReserved),
        stockValue: Math.round(stockValue * 100) / 100,
        itemCount: items.length,
        lowStockCount: items.filter((i) => thresholdOf(i) > 0 && (byItem.get(i.id) || 0) < thresholdOf(i)).length,
        strategicCount: items.filter((i) => i.strategicStock > 0 && (byItem.get(i.id) || 0) < i.strategicStock).length,
        expiringCount: expiredLots.length,
        openPurchaseOrders: openPos,
        openSalesOrders: openSos,
        pickingQueue: picking,
        readyToShip: packed,
        receivedToday: todayMoves.filter((m) => m.type === 'RECEIVE').length,
        pickedToday: todayMoves.filter((m) => m.type === 'PICK').length,
        shippedToday: todayMoves.filter((m) => m.type === 'SHIP').length,
      },
      series,
      byCategory,
      lowStock,
      expiring: expiredLots.map((lot) => ({
        id: lot.id,
        code: lot.code,
        expiryDate: lot.expiryDate,
        item: lot.item,
        qty: round3(lot.stocks.reduce((s, x) => s + x.quantity, 0)),
        location: lot.stocks[0]?.location?.code,
      })),
      recent,
    }
  })
}
