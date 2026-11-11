import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { audit } from '../lib/audit.js'
import { ApiError, pagination, parse, str } from '../lib/http.js'
import { canWrite } from '../lib/auth.js'
import { nextNumber } from '../lib/numbers.js'
import { getSettings } from '../lib/settings.js'
import { emitEvent } from '../lib/webhooks.js'
import {
  allocateOrder,
  cancelOrder,
  packLine,
  pickLine,
  shipOrder,
  round3,
} from '../lib/inventory.js'

const soLineSchema = z.object({
  itemId: z.string(),
  qty: z.coerce.number().positive(),
  unitPrice: z.coerce.number().min(0).default(0),
})

const soSchema = z.object({
  customerId: z.string().optional().nullable(),
  warehouseId: z.string(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional(),
  notes: z.string().optional().nullable(),
  shipTo: z.string().optional().nullable(),
  taxRate: z.coerce.number().min(0).optional(),
  autoAllocate: z.boolean().optional(),
  lines: z.array(soLineSchema).min(1),
})

async function sums(lines: { qty: number; unitPrice?: number }[], taxRate: number) {
  const subtotal = Math.round(lines.reduce((s, l) => s + l.qty * (l.unitPrice || 0), 0) * 100) / 100
  const taxAmount = Math.round(subtotal * taxRate) / 100
  return { subtotal, taxRate, taxAmount, total: Math.round((subtotal + taxAmount) * 100) / 100 }
}

export async function salesOrderRoutes(app: FastifyInstance) {
  app.get('/api/sales-orders', async (req) => {
    const q = req.query as Record<string, string>
    const { page, pageSize, skip, take } = pagination(q)
    const where: Record<string, unknown> = {}
    if (q.status) where.status = q.status.includes(',') ? { in: q.status.split(',') } : q.status
    if (q.warehouseId) where.warehouseId = q.warehouseId
    if (q.customerId) where.customerId = q.customerId
    if (q.q) {
      where.OR = [
        { number: { contains: q.q } },
        { customer: { name: { contains: q.q } } },
      ]
    }
    if (q.from || q.to) {
      where.createdAt = {
        ...(q.from ? { gte: new Date(q.from) } : {}),
        ...(q.to ? { lte: new Date(new Date(q.to).setHours(23, 59, 59, 999)) } : {}),
      }
    }
    const [items, total] = await Promise.all([
      prisma.salesOrder.findMany({
        where,
        include: {
          customer: true,
          warehouse: true,
          lines: { include: { item: true } },
          _count: { select: { allocations: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.salesOrder.count({ where }),
    ])
    return { items, total, page, pageSize }
  })

  app.get('/api/sales-orders/:id', async (req) => {
    const { id } = req.params as { id: string }
    const so = await prisma.salesOrder.findUnique({
      where: { id },
      include: {
        customer: true,
        warehouse: true,
        lines: {
          include: {
            item: true,
            allocations: {
              include: { location: true, lot: true },
              orderBy: { createdAt: 'asc' },
            },
          },
        },
        allocations: { include: { item: true, location: true, lot: true } },
        shipments: { orderBy: { shippedAt: 'desc' } },
      },
    })
    if (!so) throw new ApiError(404, 'أمر البيع غير موجود')
    const invoices = await prisma.invoice.findMany({ where: { refType: 'SALES_ORDER', refId: id } })
    return { ...so, invoices }
  })

  app.post('/api/sales-orders', { preHandler: [canWrite] }, async (req) => {
    const body = parse(soSchema, req.body)
    const settings = await getSettings()
    const taxRate = body.taxRate ?? Number(settings.taxRate || 0)
    const totals = await sums(body.lines, taxRate)
    const items = await prisma.item.findMany({ where: { id: { in: body.lines.map((l) => l.itemId) } } })
    if (items.length !== new Set(body.lines.map((l) => l.itemId)).size) {
      throw new ApiError(400, 'أحد الأصناف غير موجود')
    }
    const so = await prisma.$transaction(async (tx) => {
      const number = await nextNumber('SO', tx)
      return tx.salesOrder.create({
        data: {
          number,
          customerId: body.customerId || null,
          warehouseId: body.warehouseId,
          priority: body.priority || 'NORMAL',
          notes: body.notes || null,
          shipTo: body.shipTo || null,
          createdById: req.auth!.id,
          ...totals,
          lines: { create: body.lines.map((l) => ({ ...l })) },
        },
        include: { lines: { include: { item: true } }, customer: true, warehouse: true },
      })
    })
    await audit(req, 'CREATE', 'SalesOrder', so.id, { number: so.number })
    await emitEvent('sales_order.created', so)
    const shouldAllocate = body.autoAllocate ?? settings.autoAllocateOrders === 'true'
    if (shouldAllocate) {
      try {
        await allocateOrder(so.id, req.auth!.id, true)
      } catch {
        // Order stays open if stock is not enough; operator can allocate manually.
      }
    }
    const fresh = await prisma.salesOrder.findUnique({
      where: { id: so.id },
      include: { lines: { include: { item: true } }, customer: true, warehouse: true },
    })
    return fresh
  })

  app.patch('/api/sales-orders/:id', { preHandler: [canWrite] }, async (req) => {
    const { id } = req.params as { id: string }
    const body = parse(soSchema.partial(), req.body)
    const existing = await prisma.salesOrder.findUnique({
      where: { id },
      include: { lines: true, allocations: true },
    })
    if (!existing) throw new ApiError(404, 'أمر البيع غير موجود')
    if (!['OPEN', 'ALLOCATED'].includes(existing.status)) {
      throw new ApiError(409, 'لا يمكن تعديل الأمر بعد بدء التجهيز')
    }
    if (existing.allocations.some((a) => a.pickedQty > 0)) {
      throw new ApiError(409, 'لا يمكن تعديل أمر بدأ تجهيزه')
    }
    const settings = await getSettings()
    const taxRate = body.taxRate ?? existing.taxRate ?? Number(settings.taxRate || 0)
    const lines = body.lines
      ? body.lines
      : existing.lines.map((l) => ({ itemId: l.itemId, qty: l.qty, unitPrice: l.unitPrice }))
    const totals = await sums(lines, taxRate)
    const so = await prisma.$transaction(async (tx) => {
      if (body.lines) {
        await tx.allocation.deleteMany({ where: { soId: id } })
        await tx.salesOrderLine.deleteMany({ where: { soId: id } })
        for (const line of body.lines) {
          await tx.salesOrderLine.create({ data: { soId: id, ...line } })
        }
        await tx.salesOrder.update({ where: { id }, data: { status: 'OPEN' } })
      }
      return tx.salesOrder.update({
        where: { id },
        data: {
          ...(body.customerId !== undefined ? { customerId: body.customerId } : {}),
          ...(body.warehouseId ? { warehouseId: body.warehouseId } : {}),
          ...(body.priority ? { priority: body.priority } : {}),
          ...(body.notes !== undefined ? { notes: body.notes } : {}),
          ...(body.shipTo !== undefined ? { shipTo: body.shipTo } : {}),
          ...totals,
        },
        include: { lines: { include: { item: true } }, customer: true, warehouse: true },
      })
    })
    await audit(req, 'UPDATE', 'SalesOrder', id, body)
    return so
  })

  app.post('/api/sales-orders/:id/allocate', { preHandler: [canWrite] }, async (req) => {
    const { id } = req.params as { id: string }
    const result = await allocateOrder(id, req.auth!.id)
    await audit(req, 'ALLOCATE', 'SalesOrder', id, { fullyAllocated: result.fullyAllocated })
    await emitEvent('sales_order.allocated', { soId: id, fullyAllocated: result.fullyAllocated })
    return result
  })

  app.post('/api/sales-orders/:id/pick', { preHandler: [canWrite] }, async (req) => {
    const { id } = req.params as { id: string }
    const body = parse(
      z.object({
        soLineId: z.string().optional(),
        itemBarcode: z.string().optional(),
        itemId: z.string().optional(),
        locationBarcode: z.string().optional(),
        locationId: z.string().optional(),
        qty: z.coerce.number().positive().optional(),
      }),
      req.body,
    )
    const so = await prisma.salesOrder.findUnique({
      where: { id },
      include: { lines: { include: { item: true } } },
    })
    if (!so) throw new ApiError(404, 'أمر البيع غير موجود')
    let line = body.soLineId ? so.lines.find((l) => l.id === body.soLineId) : undefined
    if (!line && (body.itemBarcode || body.itemId)) {
      const item = body.itemId
        ? await prisma.item.findUnique({ where: { id: body.itemId } })
        : await prisma.item.findFirst({
            where: { OR: [{ barcode: body.itemBarcode! }, { sku: body.itemBarcode! }] },
          })
      if (!item) throw new ApiError(404, 'الصنف غير موجود')
      line =
        so.lines.find((l) => l.itemId === item.id && l.pickedQty < l.qty) ||
        so.lines.find((l) => l.itemId === item.id)
      if (!line) throw new ApiError(400, 'الصنف ليس ضمن أمر البيع')
    }
    if (!line) throw new ApiError(400, 'حدد الصنف أو السطر المطلوب')
    let locationId = body.locationId || null
    if (!locationId && body.locationBarcode) {
      const location = await prisma.location.findFirst({
        where: { OR: [{ barcode: body.locationBarcode }, { barcode: body.locationBarcode.toUpperCase() }] },
      })
      if (!location) throw new ApiError(404, 'موقع الرف غير موجود')
      locationId = location.id
    }
    const qty = body.qty ?? round3(line.qty - line.pickedQty)
    const result = await pickLine({
      soLineId: line.id,
      qty,
      locationId,
      userId: req.auth!.id,
      userName: req.auth!.name,
    })
    await audit(req, 'PICK', 'SalesOrder', id, { soLineId: line.id, qty: result.picked })
    await emitEvent('sales_order.picked', {
      soId: id,
      soNumber: so.number,
      item: line.item.name,
      qty: result.picked,
      user: req.auth!.name,
    })
    return result
  })

  app.post('/api/sales-orders/:id/pack', { preHandler: [canWrite] }, async (req) => {
    const { id } = req.params as { id: string }
    const body = parse(
      z.object({
        soLineId: z.string().optional(),
        itemBarcode: z.string().optional(),
        qty: z.coerce.number().positive().optional(),
      }),
      req.body,
    )
    const so = await prisma.salesOrder.findUnique({
      where: { id },
      include: { lines: { include: { item: true } } },
    })
    if (!so) throw new ApiError(404, 'أمر البيع غير موجود')
    let line = body.soLineId ? so.lines.find((l) => l.id === body.soLineId) : undefined
    if (!line && body.itemBarcode) {
      const item = await prisma.item.findFirst({
        where: { OR: [{ barcode: body.itemBarcode }, { sku: body.itemBarcode }] },
      })
      if (!item) throw new ApiError(404, 'الصنف غير موجود')
      line = so.lines.find((l) => l.itemId === item.id)
    }
    if (!line) throw new ApiError(400, 'حدد سطر الأمر')
    const result = await packLine({ soLineId: line.id, qty: body.qty || line.pickedQty - line.packedQty })
    await audit(req, 'PACK', 'SalesOrder', id, { soLineId: line.id, qty: result.packed })
    return result
  })

  app.post('/api/sales-orders/:id/ship', { preHandler: [canWrite] }, async (req) => {
    const { id } = req.params as { id: string }
    const body = parse(
      z.object({
        carrier: z.string().optional(),
        tracking: z.string().optional(),
        notes: z.string().optional(),
      }),
      req.body,
    )
    const result = await shipOrder({ soId: id, ...body, userId: req.auth!.id, userName: req.auth!.name })
    await audit(req, 'SHIP', 'SalesOrder', id, body)
    await emitEvent('sales_order.shipped', {
      soId: id,
      soNumber: result.order.number,
      carrier: body.carrier,
      tracking: body.tracking,
      user: req.auth!.name,
    })
    return result
  })

  app.post('/api/sales-orders/:id/cancel', { preHandler: [canWrite] }, async (req) => {
    const { id } = req.params as { id: string }
    const so = await cancelOrder(id, req.auth!.id, req.auth!.name)
    await audit(req, 'CANCEL', 'SalesOrder', id)
    await emitEvent('sales_order.cancelled', { soId: id })
    return so
  })

  // --------------------------------------------------------------- queues
  app.get('/api/picking/queue', async (req) => {
    const q = req.query as Record<string, string>
    const where: Record<string, unknown> = {
      status: { in: ['ALLOCATED', 'PICKING', 'PICKED'] },
    }
    if (q.warehouseId) where.warehouseId = q.warehouseId
    if (q.q) {
      where.OR = [{ number: { contains: q.q } }, { customer: { name: { contains: q.q } } }]
    }
    const orders = await prisma.salesOrder.findMany({
      where,
      include: {
        customer: true,
        warehouse: true,
        lines: { include: { item: true } },
        allocations: { include: { location: true, lot: true, item: true } },
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      take: 100,
    })
    return orders.map((so) => {
      const tasks = so.allocations.filter((a) => a.pickedQty < a.qty)
      return {
        ...so,
        tasks,
        tasksRemaining: tasks.length,
        unitsRemaining: round3(tasks.reduce((s, a) => s + (a.qty - a.pickedQty), 0)),
      }
    })
  })

  app.get('/api/picking/:soId', async (req) => {
    const { soId } = req.params as { soId: string }
    const so = await prisma.salesOrder.findUnique({
      where: { id: soId },
      include: {
        customer: true,
        warehouse: true,
        lines: { include: { item: true } },
        allocations: {
          include: { item: true, location: { include: { zone: true } }, lot: true },
          orderBy: { location: { code: 'asc' } },
        },
      },
    })
    if (!so) throw new ApiError(404, 'أمر البيع غير موجود')
    const tasks = so.allocations
      .filter((a) => a.pickedQty < a.qty)
      .map((a) => ({
        ...a,
        remaining: round3(a.qty - a.pickedQty),
      }))
    return { order: so, tasks }
  })

  app.get('/api/shipping/queue', async (req) => {
    const q = req.query as Record<string, string>
    const orders = await prisma.salesOrder.findMany({
      where: {
        status: { in: ['PICKED', 'PACKED'] },
        ...(q.warehouseId ? { warehouseId: q.warehouseId } : {}),
        ...(q.q ? { number: { contains: q.q } } : {}),
      },
      include: {
        customer: true,
        warehouse: true,
        lines: { include: { item: true } },
        shipments: true,
      },
      orderBy: { updatedAt: 'asc' },
      take: 100,
    })
    return orders
  })

  app.get('/api/shipments', async (req) => {
    const q = req.query as Record<string, string>
    const { page, pageSize, skip, take } = pagination(q)
    const where: Record<string, unknown> = {}
    if (q.q) {
      where.OR = [
        { tracking: { contains: q.q } },
        { carrier: { contains: q.q } },
        { so: { number: { contains: q.q } } },
      ]
    }
    const [items, total] = await Promise.all([
      prisma.shipment.findMany({
        where,
        include: { so: { include: { customer: true, warehouse: true } } },
        orderBy: { shippedAt: 'desc' },
        skip,
        take,
      }),
      prisma.shipment.count({ where }),
    ])
    return { items, total, page, pageSize }
  })
}
