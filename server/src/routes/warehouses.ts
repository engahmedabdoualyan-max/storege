import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { audit } from '../lib/audit'
import { ApiError, pagination, parse, str } from '../lib/http'
import { canManage, canWrite } from '../lib/auth'

const warehouseSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  address: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  manager: z.string().optional().nullable(),
  active: z.boolean().optional(),
})

const locationSchema = z.object({
  warehouseId: z.string().min(1),
  zoneId: z.string().optional().nullable(),
  code: z.string().min(1),
  barcode: z.string().optional(),
  name: z.string().optional().nullable(),
  rack: z.string().optional().nullable(),
  column: z.string().optional().nullable(),
  type: z.enum(['PICK', 'STAGING', 'DOCK', 'QUARANTINE', 'SHIPPING']).optional(),
  capacity: z.coerce.number().optional().nullable(),
  active: z.boolean().optional(),
})

export async function warehouseRoutes(app: FastifyInstance) {
  app.get('/api/warehouses', async () => {
    const warehouses = await prisma.warehouse.findMany({
      include: { _count: { select: { zones: true, locations: true } } },
      orderBy: { createdAt: 'asc' },
    })
    const stocks = await prisma.stock.findMany({
      select: { quantity: true, reserved: true, item: { select: { cost: true } }, location: { select: { warehouseId: true } } },
    })
    return warehouses.map((w) => {
      const rows = stocks.filter((s) => s.location.warehouseId === w.id)
      const onHand = rows.reduce((sum, r) => sum + r.quantity, 0)
      return {
        ...w,
        stats: {
          onHand: Math.round(onHand * 1000) / 1000,
          reserved: Math.round(rows.reduce((s, r) => s + r.reserved, 0) * 1000) / 1000,
          value: Math.round(rows.reduce((s, r) => s + r.quantity * r.item.cost, 0) * 100) / 100,
        },
      }
    })
  })

  app.post('/api/warehouses', { preHandler: [canManage] }, async (req) => {
    const body = parse(warehouseSchema, req.body)
    const exists = await prisma.warehouse.findUnique({ where: { code: body.code } })
    if (exists) throw new ApiError(409, 'كود المخزن مستخدم بالفعل')
    const warehouse = await prisma.warehouse.create({
      data: { ...body, address: body.address || null, phone: body.phone || null, manager: body.manager || null },
    })
    await audit(req, 'CREATE', 'Warehouse', warehouse.id, { code: warehouse.code })
    return warehouse
  })

  app.patch('/api/warehouses/:id', { preHandler: [canManage] }, async (req) => {
    const { id } = req.params as { id: string }
    const body = parse(warehouseSchema.partial(), req.body)
    return prisma.warehouse.update({ where: { id }, data: body })
  })

  app.get('/api/warehouses/:id', async (req) => {
    const { id } = req.params as { id: string }
    const warehouse = await prisma.warehouse.findUnique({
      where: { id },
      include: {
        zones: { include: { _count: { select: { locations: true } } }, orderBy: { code: 'asc' } },
        locations: { orderBy: { code: 'asc' } },
      },
    })
    if (!warehouse) throw new ApiError(404, 'المخزن غير موجود')
    return warehouse
  })

  // ------------------------------------------------------------------ zones
  app.get('/api/zones', async (req) => {
    const q = req.query as Record<string, string>
    return prisma.zone.findMany({
      where: q.warehouseId ? { warehouseId: q.warehouseId } : {},
      include: { warehouse: true, _count: { select: { locations: true } } },
      orderBy: [{ warehouseId: 'asc' }, { code: 'asc' }],
    })
  })

  app.post('/api/zones', { preHandler: [canManage] }, async (req) => {
    const body = parse(
      z.object({
        warehouseId: z.string(),
        code: z.string().min(1),
        name: z.string().min(1),
        type: z.string().optional(),
      }),
      req.body,
    )
    const zone = await prisma.zone.create({ data: { ...body, type: body.type || 'STORAGE' } })
    await audit(req, 'CREATE', 'Zone', zone.id, { code: zone.code })
    return zone
  })

  app.patch('/api/zones/:id', { preHandler: [canManage] }, async (req) => {
    const { id } = req.params as { id: string }
    const body = parse(
      z.object({ code: z.string().optional(), name: z.string().optional(), type: z.string().optional() }),
      req.body,
    )
    return prisma.zone.update({ where: { id }, data: body })
  })

  // -------------------------------------------------------------- locations
  app.get('/api/locations', async (req) => {
    const q = req.query as Record<string, string>
    const where: Record<string, unknown> = {}
    if (q.warehouseId) where.warehouseId = q.warehouseId
    if (q.zoneId) where.zoneId = q.zoneId
    if (q.type) where.type = q.type
    if (q.active === 'false') where.active = false
    if (q.q) {
      where.OR = [{ code: { contains: q.q } }, { name: { contains: q.q } }, { barcode: { contains: q.q } }]
    }
    if (q.all === '1') {
      return prisma.location.findMany({
        where,
        include: { zone: true, warehouse: true },
        orderBy: [{ warehouseId: 'asc' }, { code: 'asc' }],
      })
    }
    const { page, pageSize, skip, take } = pagination(q)
    const [items, total] = await Promise.all([
      prisma.location.findMany({
        where,
        include: {
          zone: true,
          warehouse: true,
          _count: { select: { stocks: true } },
        },
        orderBy: [{ warehouseId: 'asc' }, { code: 'asc' }],
        skip,
        take,
      }),
      prisma.location.count({ where }),
    ])
    return { items, total, page, pageSize }
  })

  app.get('/api/locations/:id', async (req) => {
    const { id } = req.params as { id: string }
    const location = await prisma.location.findUnique({
      where: { id },
      include: {
        zone: true,
        warehouse: true,
        stocks: {
          where: { quantity: { not: 0 } },
          include: { item: { include: { category: true } }, lot: true },
          orderBy: { item: { name: 'asc' } },
        },
      },
    })
    if (!location) throw new ApiError(404, 'الموقع غير موجود')
    return location
  })

  app.post('/api/locations', { preHandler: [canManage] }, async (req) => {
    const body = parse(locationSchema, req.body)
    const warehouse = await prisma.warehouse.findUnique({ where: { id: body.warehouseId } })
    if (!warehouse) throw new ApiError(404, 'المخزن غير موجود')
    const dup = await prisma.location.findFirst({
      where: { warehouseId: body.warehouseId, code: body.code },
    })
    if (dup) throw new ApiError(409, 'كود الموقع مستخدم في نفس المخزن')
    const barcode = body.barcode || `${warehouse.code}-${body.code}`.toUpperCase()
    const barcodeDup = await prisma.location.findFirst({ where: { barcode } })
    if (barcodeDup) throw new ApiError(409, 'باركود الموقع مستخدم بالفعل')
    const location = await prisma.location.create({
      data: {
        warehouseId: body.warehouseId,
        zoneId: body.zoneId || null,
        code: body.code,
        barcode,
        name: body.name || body.code,
        rack: body.rack || null,
        column: body.column || null,
        type: body.type || 'PICK',
        capacity: body.capacity ?? null,
        active: body.active ?? true,
      },
      include: { warehouse: true, zone: true },
    })
    await audit(req, 'CREATE', 'Location', location.id, { code: location.code })
    return location
  })

  app.patch('/api/locations/:id', { preHandler: [canManage] }, async (req) => {
    const { id } = req.params as { id: string }
    const body = parse(locationSchema.partial(), req.body)
    const existing = await prisma.location.findUnique({ where: { id } })
    if (!existing) throw new ApiError(404, 'الموقع غير موجود')
    if (body.barcode && body.barcode !== existing.barcode) {
      const dup = await prisma.location.findFirst({ where: { barcode: body.barcode, NOT: { id } } })
      if (dup) throw new ApiError(409, 'باركود الموقع مستخدم بالفعل')
    }
    return prisma.location.update({
      where: { id },
      data: {
        ...(body.zoneId !== undefined ? { zoneId: body.zoneId } : {}),
        ...(body.code ? { code: body.code } : {}),
        ...(body.barcode ? { barcode: body.barcode } : {}),
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.type ? { type: body.type } : {}),
        ...(body.capacity !== undefined ? { capacity: body.capacity } : {}),
        ...(body.active !== undefined ? { active: body.active } : {}),
      },
    })
  })

  app.delete('/api/locations/:id', { preHandler: [canManage] }, async (req) => {
    const { id } = req.params as { id: string }
    const stock = await prisma.stock.count({ where: { locationId: id, quantity: { gt: 0 } } })
    if (stock > 0) throw new ApiError(409, 'لا يمكن حذف موقع يحتوي على مخزون')
    await prisma.location.delete({ where: { id } })
    await audit(req, 'DELETE', 'Location', id)
    return { ok: true }
  })

  // ----------------------------------------------------------------- lookup
  app.get('/api/lookup/:code', async (req) => {
    const code = decodeURIComponent((req.params as { code: string }).code).trim()
    if (!code) throw new ApiError(400, 'الكود مطلوب')

    const item = await prisma.item.findFirst({
      where: { OR: [{ barcode: code }, { sku: code }, { barcode: code.toUpperCase() }] },
      include: {
        category: true,
        stocks: {
          where: { quantity: { not: 0 } },
          include: { location: { include: { warehouse: true } }, lot: true },
          orderBy: { quantity: 'desc' },
        },
        lots: { orderBy: { expiryDate: 'asc' } },
      },
    })
    if (item) {
      const onHand = item.stocks.reduce((s, r) => s + r.quantity, 0)
      const reserved = item.stocks.reduce((s, r) => s + r.reserved, 0)
      return { type: 'item', item: { ...item, onHand, reserved, available: onHand - reserved } }
    }

    const location = await prisma.location.findFirst({
      where: { OR: [{ barcode: code }, { barcode: code.toUpperCase() }] },
      include: {
        warehouse: true,
        zone: true,
        stocks: {
          where: { quantity: { not: 0 } },
          include: { item: true, lot: true },
        },
      },
    })
    if (location) return { type: 'location', location }

    const serial = await prisma.serial.findFirst({
      where: { serial: code },
      include: { item: true, lot: true },
    })
    if (serial) {
      const stock = await prisma.stock.findFirst({
        where: { itemId: serial.itemId, serial: serial.serial },
        include: { location: { include: { warehouse: true } }, lot: true },
      })
      return { type: 'serial', serial, stock }
    }

    const po = await prisma.purchaseOrder.findUnique({
      where: { number: code },
      include: { supplier: true, warehouse: true, lines: { include: { item: true } } },
    })
    if (po) return { type: 'purchase_order', purchaseOrder: po }

    const so = await prisma.salesOrder.findUnique({
      where: { number: code },
      include: {
        customer: true,
        warehouse: true,
        lines: {
          include: {
            item: true,
            allocations: { include: { location: true, lot: true } },
          },
        },
      },
    })
    if (so) return { type: 'sales_order', salesOrder: so }

    const transfer = await prisma.transfer.findUnique({
      where: { number: code },
      include: { fromWarehouse: true, toWarehouse: true, lines: { include: { item: true } } },
    })
    if (transfer) return { type: 'transfer', transfer }

    const invoice = await prisma.invoice.findUnique({ where: { number: code }, include: { lines: true } })
    if (invoice) return { type: 'invoice', invoice }

    const lot = await prisma.lot.findFirst({
      where: { code },
      include: { item: true, stocks: { include: { location: true } } },
    })
    if (lot) return { type: 'lot', lot }

    throw new ApiError(404, `لم يتم العثور على كود: ${code}`)
  })

  // ------------------------------------------------------ settings / branding
  app.get('/api/settings/public', async () => {
    const { getSettings } = await import('../lib/settings')
    const settings = await getSettings()
    return {
      companyName: settings.companyName,
      companyNameEn: settings.companyNameEn,
      logoUrl: settings.logoUrl,
      currency: settings.currency,
      currencySymbol: settings.currencySymbol,
    }
  })

  app.get('/api/search', async (req) => {
    const q = str((req.query as Record<string, string>).q)
    if (!q || q.length < 2) return { items: [], locations: [], orders: [] }
    const [items, locations, sos, pos] = await Promise.all([
      prisma.item.findMany({ where: { OR: [{ name: { contains: q } }, { sku: { contains: q } }, { barcode: { contains: q } }] }, take: 6 }),
      prisma.location.findMany({ where: { OR: [{ code: { contains: q } }, { barcode: { contains: q } }] }, take: 4, include: { warehouse: true } }),
      prisma.salesOrder.findMany({ where: { number: { contains: q } }, take: 4 }),
      prisma.purchaseOrder.findMany({ where: { number: { contains: q } }, take: 4 }),
    ])
    return { items, locations, orders: [...sos, ...pos] }
  })
}
