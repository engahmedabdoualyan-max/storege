import type { FastifyInstance } from 'fastify'
import { prisma } from '../lib/prisma'
import { round3 } from '../lib/inventory'

function dateRange(from?: string, to?: string) {
  const start = from ? new Date(from) : new Date(Date.now() - 1000 * 60 * 60 * 24 * 30)
  const end = to ? new Date(new Date(to).setHours(23, 59, 59, 999)) : new Date()
  return { start, end }
}

export async function reportRoutes(app: FastifyInstance) {
  app.get('/api/reports/stock-valuation', async (req) => {
    const q = req.query as Record<string, string>
    const groupBy = q.groupBy || 'category'
    const stocks = await prisma.stock.findMany({
      where: q.warehouseId ? { location: { warehouseId: q.warehouseId } } : {},
      include: {
        item: { include: { category: true } },
        location: { include: { warehouse: true } },
      },
    })
    const map = new Map<string, { label: string; qty: number; value: number; skus: Set<string> }>()
    for (const row of stocks) {
      let key = 'none'
      let label = 'غير مصنف'
      if (groupBy === 'warehouse') {
        key = row.location.warehouseId
        label = row.location.warehouse.name
      } else if (groupBy === 'location') {
        key = row.locationId
        label = row.location.code
      } else if (row.item.category) {
        key = row.item.category.id
        label = row.item.category.name
      }
      const entry = map.get(key) || { label, qty: 0, value: 0, skus: new Set<string>() }
      entry.qty += row.quantity
      entry.value += row.quantity * row.item.cost
      entry.skus.add(row.itemId)
      map.set(key, entry)
    }
    const rows = [...map.values()]
      .map((r) => ({
        label: r.label,
        qty: round3(r.qty),
        value: Math.round(r.value * 100) / 100,
        skuCount: r.skus.size,
      }))
      .sort((a, b) => b.value - a.value)
    return {
      rows,
      totals: {
        value: Math.round(rows.reduce((s, r) => s + r.value, 0) * 100) / 100,
        qty: round3(rows.reduce((s, r) => s + r.qty, 0)),
      },
    }
  })

  app.get('/api/reports/low-stock', async (req) => {
    const q = req.query as Record<string, string>
    const stocks = await prisma.stock.findMany({
      where: q.warehouseId ? { location: { warehouseId: q.warehouseId } } : {},
      select: { itemId: true, quantity: true },
    })
    const totals = new Map<string, number>()
    for (const s of stocks) totals.set(s.itemId, (totals.get(s.itemId) || 0) + s.quantity)
    const items = await prisma.item.findMany({
      where: { active: true, OR: [{ minStock: { gt: 0 } }, { strategicStock: { gt: 0 } }] },
      include: { category: true },
    })
    const rows = items
      .map((item) => {
        const onHand = round3(totals.get(item.id) || 0)
        const strategic = item.strategicStock > 0
        const threshold = strategic ? item.strategicStock : item.minStock
        const shortage = round3(Math.max(0, threshold - onHand))
        return {
          id: item.id,
          sku: item.sku,
          name: item.name,
          category: item.category?.name || '',
          unit: item.unit,
          onHand,
          minStock: item.minStock,
          strategicStock: item.strategicStock,
          threshold,
          strategic,
          reorderQty: item.reorderQty || shortage,
          shortage,
          cost: item.cost,
          value: Math.round(shortage * item.cost * 100) / 100,
          severity: shortage <= 0 ? 'ok' : onHand / (threshold || 1) < 0.5 ? 'critical' : 'warning',
        }
      })
      .filter((r) => r.shortage > 0)
      .sort((a, b) => b.shortage / (b.threshold || 1) - a.shortage / (a.threshold || 1))
    return {
      rows,
      totals: {
        count: rows.length,
        strategicCount: rows.filter((r) => r.strategic).length,
        shortage: round3(rows.reduce((s, r) => s + r.shortage, 0)),
        reorderValue: Math.round(rows.reduce((s, r) => s + r.value, 0) * 100) / 100,
      },
    }
  })

  // Wave / batch picking: aggregated pick list across multiple sales orders.
  app.get('/api/reports/pick-wave', async (req) => {
    const q = req.query as Record<string, string>
    const ids = String(q.ids || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    if (!ids.length) return { lines: [], orders: 0 }
    const allocations = await prisma.allocation.findMany({
      where: { soId: { in: ids } },
      include: { item: true, location: true },
    })
    const map = new Map<string, { itemId: string; sku: string; name: string; unit: string; locationId: string; locationCode: string; qty: number; picked: number }>()
    for (const a of allocations) {
      const key = `${a.itemId}|${a.locationId}`
      const cur = map.get(key) || {
        itemId: a.itemId,
        sku: a.item.sku,
        name: a.item.name,
        unit: a.item.unit,
        locationId: a.locationId,
        locationCode: a.location.code,
        qty: 0,
        picked: 0,
      }
      cur.qty += a.qty
      cur.picked += a.pickedQty
      map.set(key, cur)
    }
    return { lines: [...map.values()], orders: ids.length }
  })

  // Purchase invoices vs. what was actually received and what is still on hand.
  app.get('/api/reports/purchase-reconciliation', async (req) => {
    const q = req.query as Record<string, string>
    const invoices = await prisma.invoice.findMany({
      where: {
        type: 'PURCHASE',
        status: { not: 'CANCELLED' },
        ...(q.from || q.to
          ? { date: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(`${q.to}T23:59:59`) } : {}) } }
          : {}),
      },
      include: { lines: { include: { item: { include: { category: true } } } } },
      orderBy: { date: 'desc' },
    })
    const receipts = await prisma.receiptLine.findMany({
      where: { receipt: { status: 'POSTED' } },
      select: { itemId: true, qty: true },
    })
    const stocks = await prisma.stock.findMany({ select: { itemId: true, quantity: true, reserved: true } })
    const sold = await prisma.stockMovement.groupBy({
      by: ['itemId'],
      where: { type: 'SHIP' },
      _sum: { qty: true },
    })

    const invoiced = new Map<string, { qty: number; value: number; lastDate: Date; suppliers: Set<string>; invoices: Set<string> }>()
    for (const invoice of invoices) {
      for (const line of invoice.lines) {
        if (!line.itemId) continue
        const current = invoiced.get(line.itemId) || { qty: 0, value: 0, lastDate: invoice.date, suppliers: new Set<string>(), invoices: new Set<string>() }
        current.qty += line.qty
        current.value += line.total
        if (invoice.date > current.lastDate) current.lastDate = invoice.date
        current.suppliers.add(invoice.partnerName)
        current.invoices.add(invoice.number)
        invoiced.set(line.itemId, current)
      }
    }
    const received = new Map<string, number>()
    for (const line of receipts) received.set(line.itemId, (received.get(line.itemId) || 0) + line.qty)
    const onHand = new Map<string, number>()
    const reserved = new Map<string, number>()
    for (const row of stocks) {
      onHand.set(row.itemId, (onHand.get(row.itemId) || 0) + row.quantity)
      reserved.set(row.itemId, (reserved.get(row.itemId) || 0) + row.reserved)
    }
    const shipped = new Map<string, number>()
    for (const row of sold) shipped.set(row.itemId, row._sum.qty || 0)

    const itemIds = new Set<string>([...invoiced.keys(), ...received.keys()])
    const items = await prisma.item.findMany({
      where: { id: { in: [...itemIds] } },
      include: { category: true },
    })

    const rows = items.map((item) => {
      const inv = invoiced.get(item.id)
      const invoicedQty = round3(inv?.qty || 0)
      const receivedQty = round3(received.get(item.id) || 0)
      const onHandQty = round3(onHand.get(item.id) || 0)
      const soldQty = round3(shipped.get(item.id) || 0)
      const variance = round3(receivedQty - invoicedQty)
      const status =
        invoicedQty === 0 ? 'NO_INVOICE' : variance < -0.001 ? 'SHORT_RECEIVED' : variance > 0.001 ? 'OVER_RECEIVED' : onHandQty <= 0 ? 'NOT_IN_STOCK' : 'MATCHED'
      return {
        id: item.id,
        sku: item.sku,
        name: item.name,
        unit: item.unit,
        category: item.category?.name || '',
        invoicedQty,
        invoicedValue: Math.round((inv?.value || 0) * 100) / 100,
        receivedQty,
        onHandQty,
        reservedQty: round3(reserved.get(item.id) || 0),
        soldQty,
        variance,
        invoices: inv ? inv.invoices.size : 0,
        suppliers: inv ? [...inv.suppliers].join('، ') : '',
        lastInvoiceDate: inv?.lastDate || null,
        status,
        strategicStock: item.strategicStock,
        minStock: item.minStock,
      }
    })
    rows.sort((a, b) => {
      const rank: Record<string, number> = { SHORT_RECEIVED: 0, NOT_IN_STOCK: 1, NO_INVOICE: 2, OVER_RECEIVED: 3, MATCHED: 4 }
      return (rank[a.status] ?? 9) - (rank[b.status] ?? 9) || b.invoicedValue - a.invoicedValue
    })
    return {
      rows,
      totals: {
        items: rows.length,
        invoicedQty: round3(rows.reduce((s, r) => s + r.invoicedQty, 0)),
        receivedQty: round3(rows.reduce((s, r) => s + r.receivedQty, 0)),
        onHandQty: round3(rows.reduce((s, r) => s + r.onHandQty, 0)),
        invoicedValue: Math.round(rows.reduce((s, r) => s + r.invoicedValue, 0) * 100) / 100,
        shortReceived: rows.filter((r) => r.status === 'SHORT_RECEIVED').length,
        notInStock: rows.filter((r) => r.status === 'NOT_IN_STOCK').length,
        noInvoice: rows.filter((r) => r.status === 'NO_INVOICE').length,
        matched: rows.filter((r) => r.status === 'MATCHED').length,
      },
      invoices: invoices.map((invoice) => ({
        id: invoice.id,
        number: invoice.number,
        partnerName: invoice.partnerName,
        date: invoice.date,
        total: invoice.total,
        status: invoice.status,
        lines: invoice.lines.length,
      })),
    }
  })

  app.get('/api/reports/expiry', async (req) => {
    const q = req.query as Record<string, string>
    const days = Number(q.days || 30)
    const until = new Date()
    until.setDate(until.getDate() + days)
    const lots = await prisma.lot.findMany({
      where: {
        expiryDate: { not: null, lte: until },
        stocks: {
          some: { quantity: { gt: 0 }, ...(q.warehouseId ? { location: { warehouseId: q.warehouseId } } : {}) },
        },
      },
      include: {
        item: true,
        stocks: {
          where: { quantity: { gt: 0 }, ...(q.warehouseId ? { location: { warehouseId: q.warehouseId } } : {}) },
          include: { location: { include: { warehouse: true } } },
        },
      },
      orderBy: { expiryDate: 'asc' },
    })
    const now = new Date()
    const rows = lots.map((lot) => {
      const qty = lot.stocks.reduce((s, x) => s + x.quantity, 0)
      const daysLeft = lot.expiryDate
        ? Math.ceil((lot.expiryDate.getTime() - now.getTime()) / 86400000)
        : null
      return {
        id: lot.id,
        code: lot.code,
        item: lot.item.name,
        sku: lot.item.sku,
        expiryDate: lot.expiryDate,
        daysLeft,
        qty: round3(qty),
        value: Math.round(qty * lot.item.cost * 100) / 100,
        locations: [...new Set(lot.stocks.map((s) => s.location.code))].join(', '),
        status: daysLeft === null ? 'unknown' : daysLeft < 0 ? 'expired' : daysLeft <= 30 ? 'critical' : 'soon',
      }
    })
    return {
      rows,
      totals: {
        lots: rows.length,
        qty: round3(rows.reduce((s, r) => s + r.qty, 0)),
        value: Math.round(rows.reduce((s, r) => s + r.value, 0) * 100) / 100,
        expired: rows.filter((r) => (r.daysLeft ?? 0) < 0).length,
      },
    }
  })

  app.get('/api/reports/movement', async (req) => {
    const q = req.query as Record<string, string>
    const { start, end } = dateRange(q.from, q.to)
    const where: Record<string, unknown> = { createdAt: { gte: start, lte: end } }
    if (q.warehouseId) {
      where.OR = [
        { fromLocation: { warehouseId: q.warehouseId } },
        { toLocation: { warehouseId: q.warehouseId } },
      ]
    }
    const movements = await prisma.stockMovement.findMany({
      where,
      select: { type: true, qty: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    })
    const byType = new Map<string, { count: number; qty: number }>()
    const series = new Map<string, { in: number; out: number }>()
    const inbound = new Set(['RECEIVE', 'TRANSFER_IN', 'RETURN'])
    const outbound = new Set(['SHIP', 'TRANSFER_OUT', 'PICK'])
    for (const m of movements) {
      const t = byType.get(m.type) || { count: 0, qty: 0 }
      t.count++
      t.qty = round3(t.qty + m.qty)
      byType.set(m.type, t)
      const key = m.createdAt.toISOString().slice(0, 10)
      const s = series.get(key) || { in: 0, out: 0 }
      if (inbound.has(m.type)) s.in += m.qty
      else if (outbound.has(m.type)) s.out += m.qty
      series.set(key, s)
    }
    return {
      byType: [...byType.entries()].map(([type, v]) => ({ type, ...v })),
      series: [...series.entries()].map(([date, v]) => ({ date, in: round3(v.in), out: round3(v.out) })),
      total: movements.length,
      from: start,
      to: end,
    }
  })

  app.get('/api/reports/dead-stock', async (req) => {
    const q = req.query as Record<string, string>
    const days = Number(q.days || 30)
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - days)
    const stocks = await prisma.stock.findMany({
      where: {
        quantity: { gt: 0 },
        ...(q.warehouseId ? { location: { warehouseId: q.warehouseId } } : {}),
      },
      include: { item: true, location: true },
    })
    const lastMoves = await prisma.stockMovement.findMany({
      select: { itemId: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    })
    const lastMap = new Map<string, Date>()
    for (const move of lastMoves) {
      if (!lastMap.has(move.itemId)) lastMap.set(move.itemId, move.createdAt)
    }
    const byItem = new Map<
      string,
      { item: (typeof stocks)[number]['item']; qty: number; value: number; locations: Set<string>; lastMovement: Date | null }
    >()
    for (const row of stocks) {
      const entry = byItem.get(row.itemId) || {
        item: row.item,
        qty: 0,
        value: 0,
        locations: new Set<string>(),
        lastMovement: lastMap.get(row.itemId) || null,
      }
      entry.qty += row.quantity
      entry.value += row.quantity * row.item.cost
      entry.locations.add(row.location.code)
      byItem.set(row.itemId, entry)
    }
    const rows = [...byItem.values()]
      .filter((r) => !r.lastMovement || r.lastMovement < cutoff)
      .map((r) => ({
        id: r.item.id,
        sku: r.item.sku,
        name: r.item.name,
        qty: round3(r.qty),
        value: Math.round(r.value * 100) / 100,
        locations: [...r.locations].join(', '),
        lastMovement: r.lastMovement,
        daysIdle: r.lastMovement
          ? Math.floor((Date.now() - r.lastMovement.getTime()) / 86400000)
          : null,
      }))
      .sort((a, b) => b.value - a.value)
    return {
      rows,
      totals: {
        items: rows.length,
        qty: round3(rows.reduce((s, r) => s + r.qty, 0)),
        value: Math.round(rows.reduce((s, r) => s + r.value, 0) * 100) / 100,
      },
    }
  })

  app.get('/api/reports/productivity', async (req) => {
    const q = req.query as Record<string, string>
    const { start, end } = dateRange(q.from, q.to)
    const movements = await prisma.stockMovement.findMany({
      where: { createdAt: { gte: start, lte: end }, userName: { not: null } },
      select: { userName: true, type: true, qty: true },
    })
    const map = new Map<string, Record<string, number>>()
    for (const m of movements) {
      const user = m.userName || 'غير معروف'
      const entry = map.get(user) || {}
      entry[m.type] = (entry[m.type] || 0) + m.qty
      entry[`${m.type}_count`] = (entry[`${m.type}_count`] || 0) + 1
      map.set(user, entry)
    }
    const rows = [...map.entries()].map(([user, types]) => ({
      user,
      received: round3(types.RECEIVE || 0),
      picked: round3(types.PICK || 0),
      shipped: round3(types.SHIP || 0),
      adjusted: round3(types.ADJUST || 0),
      counts: round3(types.COUNT || 0),
      operations: Object.entries(types)
        .filter(([key]) => key.endsWith('_count'))
        .reduce((s, [, v]) => s + v, 0),
    }))
    return { rows: rows.sort((a, b) => b.operations - a.operations), from: start, to: end }
  })

  app.get('/api/reports/top-items', async (req) => {
    const q = req.query as Record<string, string>
    const days = Number(q.days || 30)
    const start = new Date()
    start.setDate(start.getDate() - days)
    const moves = await prisma.stockMovement.findMany({
      where: {
        createdAt: { gte: start },
        type: { in: ['PICK', 'SHIP', 'RECEIVE'] },
        ...(q.warehouseId
          ? { OR: [{ fromLocation: { warehouseId: q.warehouseId } }, { toLocation: { warehouseId: q.warehouseId } }] }
          : {}),
      },
      select: { itemId: true, qty: true },
    })
    const totals = new Map<string, { qty: number; operations: number }>()
    for (const move of moves) {
      const entry = totals.get(move.itemId) || { qty: 0, operations: 0 }
      entry.qty += move.qty
      entry.operations += 1
      totals.set(move.itemId, entry)
    }
    const grouped = [...totals.entries()]
      .sort((a, b) => b[1].qty - a[1].qty)
      .slice(0, Number(q.limit || 10))
    const items = await prisma.item.findMany({ where: { id: { in: grouped.map(([id]) => id) } } })
    const map = new Map(items.map((i) => [i.id, i]))
    return grouped.map(([itemId, entry]) => ({
      itemId,
      sku: map.get(itemId)?.sku,
      name: map.get(itemId)?.name,
      qty: round3(entry.qty),
      operations: entry.operations,
    }))
  })

  app.get('/api/reports/abc', async (req) => {
    const q = req.query as Record<string, string>
    const stocks = await prisma.stock.findMany({
      where: q.warehouseId ? { location: { warehouseId: q.warehouseId } } : {},
      include: { item: true },
    })
    const map = new Map<string, { name: string; sku: string; qty: number; value: number }>()
    for (const row of stocks) {
      const entry = map.get(row.itemId) || {
        name: row.item.name,
        sku: row.item.sku,
        qty: 0,
        value: 0,
      }
      entry.qty += row.quantity
      entry.value += row.quantity * row.item.cost
      map.set(row.itemId, entry)
    }
    const sorted = [...map.values()].sort((a, b) => b.value - a.value)
    const total = sorted.reduce((s, r) => s + r.value, 0)
    let cumulative = 0
    const rows = sorted.map((r, index) => {
      cumulative += r.value
      const cumulativePct = total ? (cumulative / total) * 100 : 0
      return {
        rank: index + 1,
        sku: r.sku,
        name: r.name,
        qty: round3(r.qty),
        value: Math.round(r.value * 100) / 100,
        cumulativePct: Math.round(cumulativePct * 10) / 10,
        class: cumulativePct <= 80 ? 'A' : cumulativePct <= 95 ? 'B' : 'C',
      }
    })
    return { rows, total: Math.round(total * 100) / 100 }
  })

  app.get('/api/reports/count-accuracy', async (req) => {
    const q = req.query as Record<string, string>
    const days = Number(q.days || 90)
    const start = new Date()
    start.setDate(start.getDate() - days)
    const counts = await prisma.cycleCount.findMany({
      where: { status: 'COMPLETED', completedAt: { gte: start } },
      include: { lines: true, warehouse: true },
      orderBy: { completedAt: 'desc' },
      take: 50,
    })
    const rows = counts.map((count) => {
      const expected = count.lines.reduce((s, l) => s + l.expectedQty, 0)
      const variance = count.lines.reduce((s, l) => s + Math.abs(l.variance || 0), 0)
      return {
        id: count.id,
        number: count.number,
        warehouse: count.warehouse.name,
        lines: count.lines.length,
        expected: round3(expected),
        variance: round3(variance),
        accuracy: expected ? Math.round((1 - variance / expected) * 10000) / 100 : 100,
        completedAt: count.completedAt,
      }
    })
    return {
      rows,
      averageAccuracy: rows.length
        ? Math.round((rows.reduce((s, r) => s + r.accuracy, 0) / rows.length) * 100) / 100
        : 100,
    }
  })
}
