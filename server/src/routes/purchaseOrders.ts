import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { audit } from '../lib/audit'
import { ApiError, pagination, parse, str } from '../lib/http'
import { canWrite } from '../lib/auth'
import { nextNumber } from '../lib/numbers'
import { getSettings } from '../lib/settings'
import { emitEvent } from '../lib/webhooks'
import { consumeAt, receiveStock, round3 } from '../lib/inventory'

const lineSchema = z.object({
  itemId: z.string(),
  qty: z.coerce.number().positive(),
  unitCost: z.coerce.number().min(0).default(0),
})

const poSchema = z.object({
  supplierId: z.string().optional().nullable(),
  warehouseId: z.string(),
  expectedAt: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  taxRate: z.coerce.number().min(0).optional(),
  lines: z.array(lineSchema).min(1),
})

async function totals(lines: { qty: number; unitCost?: number }[], taxRate: number) {
  const subtotal = Math.round(lines.reduce((s, l) => s + l.qty * (l.unitCost || 0), 0) * 100) / 100
  const taxAmount = Math.round(subtotal * taxRate) / 100
  return { subtotal, taxRate, taxAmount, total: Math.round((subtotal + taxAmount) * 100) / 100 }
}

async function refreshPoStatus(poId: string) {
  const po = await prisma.purchaseOrder.findUnique({ where: { id: poId }, include: { lines: true } })
  if (!po) return
  const receivedAll = po.lines.every((l) => l.receivedQty >= l.qty)
  const any = po.lines.some((l) => l.receivedQty > 0)
  const status = receivedAll ? 'RECEIVED' : any ? 'PARTIAL' : 'OPEN'
  await prisma.purchaseOrder.update({ where: { id: poId }, data: { status } })
}

export async function purchaseOrderRoutes(app: FastifyInstance) {
  app.get('/api/purchase-orders', async (req) => {
    const q = req.query as Record<string, string>
    const { page, pageSize, skip, take } = pagination(q)
    const where: Record<string, unknown> = {}
    if (q.status) where.status = q.status
    if (q.warehouseId) where.warehouseId = q.warehouseId
    if (q.supplierId) where.supplierId = q.supplierId
    if (q.q) {
      where.OR = [
        { number: { contains: q.q } },
        { supplier: { name: { contains: q.q } } },
      ]
    }
    if (q.from || q.to) {
      where.createdAt = {
        ...(q.from ? { gte: new Date(q.from) } : {}),
        ...(q.to ? { lte: new Date(new Date(q.to).setHours(23, 59, 59, 999)) } : {}),
      }
    }
    const [items, total] = await Promise.all([
      prisma.purchaseOrder.findMany({
        where,
        include: {
          supplier: true,
          warehouse: true,
          lines: { include: { item: true } },
          _count: { select: { receipts: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.purchaseOrder.count({ where }),
    ])
    return { items, total, page, pageSize }
  })

  app.get('/api/purchase-orders/:id', async (req) => {
    const { id } = req.params as { id: string }
    const po = await prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        supplier: true,
        warehouse: true,
        lines: { include: { item: true } },
        receipts: {
          include: {
            lines: { include: { item: true, location: true } },
            warehouse: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    })
    if (!po) throw new ApiError(404, 'أمر الشراء غير موجود')
    return po
  })

  app.post('/api/purchase-orders', { preHandler: [canWrite] }, async (req) => {
    const body = parse(poSchema, req.body)
    const settings = await getSettings()
    const taxRate = body.taxRate ?? Number(settings.taxRate || 0)
    const sums = await totals(body.lines, taxRate)
    const items = await prisma.item.findMany({ where: { id: { in: body.lines.map((l) => l.itemId) } } })
    if (items.length !== new Set(body.lines.map((l) => l.itemId)).size) {
      throw new ApiError(400, 'أحد الأصناف غير موجود')
    }
    const po = await prisma.$transaction(async (tx) => {
      const number = await nextNumber('PO', tx)
      return tx.purchaseOrder.create({
        data: {
          number,
          supplierId: body.supplierId || null,
          warehouseId: body.warehouseId,
          expectedAt: body.expectedAt ? new Date(body.expectedAt) : null,
          notes: body.notes || null,
          createdById: req.auth!.id,
          ...sums,
          lines: { create: body.lines.map((l) => ({ ...l })) },
        },
        include: { lines: { include: { item: true } }, supplier: true, warehouse: true },
      })
    })
    await audit(req, 'CREATE', 'PurchaseOrder', po.id, { number: po.number })
    await emitEvent('purchase_order.created', po)
    return po
  })

  app.patch('/api/purchase-orders/:id', { preHandler: [canWrite] }, async (req) => {
    const { id } = req.params as { id: string }
    const body = parse(poSchema.partial(), req.body)
    const existing = await prisma.purchaseOrder.findUnique({ where: { id }, include: { lines: true } })
    if (!existing) throw new ApiError(404, 'أمر الشراء غير موجود')
    if (existing.status !== 'OPEN') throw new ApiError(409, 'لا يمكن تعديل أمر تم استلامه أو إلغاؤه')
    const settings = await getSettings()
    const taxRate = body.taxRate ?? existing.taxRate ?? Number(settings.taxRate || 0)
    const lines = body.lines
      ? body.lines
      : existing.lines.map((l) => ({ itemId: l.itemId, qty: l.qty, unitCost: l.unitCost }))
    const sums = await totals(lines, taxRate)
    const po = await prisma.$transaction(async (tx) => {
      if (body.lines) {
        await tx.purchaseOrderLine.deleteMany({ where: { poId: id } })
        for (const line of body.lines) {
          await tx.purchaseOrderLine.create({ data: { poId: id, ...line } })
        }
      }
      return tx.purchaseOrder.update({
        where: { id },
        data: {
          ...(body.supplierId !== undefined ? { supplierId: body.supplierId } : {}),
          ...(body.warehouseId ? { warehouseId: body.warehouseId } : {}),
          ...(body.expectedAt !== undefined
            ? { expectedAt: body.expectedAt ? new Date(body.expectedAt) : null }
            : {}),
          ...(body.notes !== undefined ? { notes: body.notes } : {}),
          ...sums,
        },
        include: { lines: { include: { item: true } }, supplier: true, warehouse: true },
      })
    })
    await audit(req, 'UPDATE', 'PurchaseOrder', id, body)
    return po
  })

  app.post('/api/purchase-orders/:id/cancel', { preHandler: [canWrite] }, async (req) => {
    const { id } = req.params as { id: string }
    const po = await prisma.purchaseOrder.findUnique({ where: { id }, include: { lines: true } })
    if (!po) throw new ApiError(404, 'أمر الشراء غير موجود')
    if (po.status === 'RECEIVED') throw new ApiError(409, 'لا يمكن إلغاء أمر مستلم بالكامل')
    const updated = await prisma.purchaseOrder.update({ where: { id }, data: { status: 'CANCELLED' } })
    await audit(req, 'CANCEL', 'PurchaseOrder', id)
    return updated
  })

  app.post('/api/purchase-orders/:id/receive', { preHandler: [canWrite] }, async (req) => {
    const { id } = req.params as { id: string }
    const body = parse(
      z.object({
        locationId: z.string().optional().nullable(),
        notes: z.string().optional().nullable(),
        lines: z
          .array(
            z.object({
              poLineId: z.string(),
              itemId: z.string().optional(),
              qty: z.coerce.number().positive(),
              locationId: z.string().optional().nullable(),
              lotCode: z.string().optional().nullable(),
              expiryDate: z.string().optional().nullable(),
              serials: z.array(z.string()).optional(),
            }),
          )
          .min(1),
      }),
      req.body,
    )
    const po = await prisma.purchaseOrder.findUnique({
      where: { id },
      include: { lines: true, supplier: true },
    })
    if (!po) throw new ApiError(404, 'أمر الشراء غير موجود')
    if (['CANCELLED', 'RECEIVED'].includes(po.status)) {
      throw new ApiError(409, 'لا يمكن الاستلام على هذا الأمر')
    }
    let defaultLocation = body.locationId || null
    if (!defaultLocation) {
      const dock = await prisma.location.findFirst({
        where: { warehouseId: po.warehouseId, type: { in: ['DOCK', 'STAGING'] }, active: true },
        orderBy: { createdAt: 'asc' },
      })
      const any = dock || (await prisma.location.findFirst({ where: { warehouseId: po.warehouseId, active: true } }))
      defaultLocation = any?.id || null
    }

    const receipt = await prisma.$transaction(async (tx) => {
      const number = await nextNumber('GRN', tx)
      const receipt = await tx.receipt.create({
        data: {
          number,
          poId: po.id,
          warehouseId: po.warehouseId,
          notes: body.notes || null,
          createdById: req.auth!.id,
        },
      })
      for (const input of body.lines) {
        const poLine = po.lines.find((l) => l.id === input.poLineId)
        if (!poLine) throw new ApiError(400, 'سطر أمر شراء غير صحيح')
        const remaining = round3(poLine.qty - poLine.receivedQty)
        if (input.qty > remaining + 0.001) {
          throw new ApiError(409, `الكمية أكبر من المتبقي (${remaining}) للصنف`)
        }
        const locationId = input.locationId || defaultLocation
        if (!locationId) throw new ApiError(400, 'لا يوجد موقع استلام محدد')
        const location = await tx.location.findUnique({ where: { id: locationId } })
        if (!location || location.warehouseId !== po.warehouseId) {
          throw new ApiError(400, 'موقع الاستلام لا يتبع مخزن أمر الشراء')
        }
        const item = await tx.item.findUnique({ where: { id: poLine.itemId } })
        if (!item) throw new ApiError(404, 'الصنف غير موجود')
        const { lotId } = await receiveStock(tx, {
          itemId: item.id,
          locationId,
          qty: input.qty,
          lotCode: input.lotCode,
          expiryDate: input.expiryDate,
          serials: input.serials,
        })
        await tx.receiptLine.create({
          data: {
            receiptId: receipt.id,
            poLineId: poLine.id,
            itemId: item.id,
            locationId,
            lotCode: input.lotCode || null,
            expiryDate: input.expiryDate ? new Date(input.expiryDate) : null,
            serials: input.serials?.length ? JSON.stringify(input.serials) : null,
            qty: input.qty,
          },
        })
        await tx.stockMovement.create({
          data: {
            type: 'RECEIVE',
            itemId: item.id,
            toLocationId: locationId,
            lotId,
            qty: input.qty,
            refType: 'PURCHASE_ORDER',
            refId: po.id,
            userId: req.auth!.id,
            userName: req.auth!.name,
            note: `${po.number} · ${receipt.number}`,
          },
        })
        await tx.purchaseOrderLine.update({
          where: { id: poLine.id },
          data: { receivedQty: { increment: input.qty } },
        })
      }
      return receipt
    })

    await refreshPoStatus(po.id)
    const full = await prisma.receipt.findUnique({
      where: { id: receipt.id },
      include: {
        lines: { include: { item: true, location: true } },
        po: { include: { supplier: true } },
        warehouse: true,
      },
    })
    await audit(req, 'RECEIVE', 'PurchaseOrder', po.id, { receipt: receipt.number, lines: body.lines })
    await emitEvent('receipt.posted', {
      receiptNumber: receipt.number,
      poNumber: po.number,
      supplier: po.supplier?.name,
      lines: body.lines,
      user: req.auth!.name,
    })
    return full
  })

  // -------------------------------------------------------------- receipts
  app.get('/api/receipts', async (req) => {
    const q = req.query as Record<string, string>
    const { page, pageSize, skip, take } = pagination(q)
    const where: Record<string, unknown> = {}
    if (q.poId) where.poId = q.poId
    if (q.warehouseId) where.warehouseId = q.warehouseId
    if (q.q) where.OR = [{ number: { contains: q.q } }, { po: { number: { contains: q.q } } }]
    const [items, total] = await Promise.all([
      prisma.receipt.findMany({
        where,
        include: {
          po: { include: { supplier: true } },
          warehouse: true,
          lines: { include: { item: true, location: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.receipt.count({ where }),
    ])
    return { items, total, page, pageSize }
  })

  app.get('/api/receipts/:id', async (req) => {
    const { id } = req.params as { id: string }
    const receipt = await prisma.receipt.findUnique({
      where: { id },
      include: {
        po: { include: { supplier: true } },
        warehouse: true,
        lines: { include: { item: true, location: true, poLine: true } },
      },
    })
    if (!receipt) throw new ApiError(404, 'سند الاستلام غير موجود')
    return receipt
  })

  app.post('/api/receipts/:id/cancel', { preHandler: [canWrite] }, async (req) => {
    const { id } = req.params as { id: string }
    const receipt = await prisma.receipt.findUnique({
      where: { id },
      include: { lines: true, po: true },
    })
    if (!receipt) throw new ApiError(404, 'سند الاستلام غير موجود')
    if (receipt.status === 'CANCELLED') throw new ApiError(409, 'السند ملغي بالفعل')
    await prisma.$transaction(async (tx) => {
      for (const line of receipt.lines) {
        if (!line.locationId) continue
        const serials = line.serials ? (JSON.parse(line.serials) as string[]) : undefined
        await consumeAt(tx, {
          itemId: line.itemId,
          locationId: line.locationId,
          qty: line.qty,
          serials,
          ignoreReserved: true,
        })
        await tx.stockMovement.create({
          data: {
            type: 'ADJUST',
            itemId: line.itemId,
            fromLocationId: line.locationId,
            qty: line.qty,
            refType: 'RECEIPT_CANCEL',
            refId: receipt.id,
            userId: req.auth!.id,
            userName: req.auth!.name,
            note: `إلغاء سند استلام ${receipt.number}`,
          },
        })
        if (line.poLineId) {
          await tx.purchaseOrderLine.update({
            where: { id: line.poLineId },
            data: { receivedQty: { decrement: line.qty } },
          })
        }
      }
      await tx.receipt.update({ where: { id }, data: { status: 'CANCELLED' } })
    })
    if (receipt.poId) await refreshPoStatus(receipt.poId)
    await audit(req, 'CANCEL', 'Receipt', id)
    await emitEvent('receipt.cancelled', { receiptNumber: receipt.number })
    return { ok: true }
  })

  // -------------------------------------------------------------- putaway
  app.get('/api/putaway/pending', async (req) => {
    const q = req.query as Record<string, string>
    const where: Record<string, unknown> = {
      quantity: { gt: 0 },
      location: {
        type: { in: ['DOCK', 'STAGING'] },
        ...(q.warehouseId ? { warehouseId: q.warehouseId } : {}),
      },
    }
    if (q.locationId) where.locationId = q.locationId
    const [items, locations] = await Promise.all([
      prisma.stock.findMany({
        where,
        include: { item: true, location: { include: { warehouse: true } }, lot: true },
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.location.findMany({
        where: {
          type: 'PICK',
          active: true,
          ...(q.warehouseId ? { warehouseId: q.warehouseId } : {}),
        },
        include: { warehouse: true, zone: true },
        orderBy: { code: 'asc' },
      }),
    ])
    return { items, locations }
  })

  app.post('/api/putaway/confirm', { preHandler: [canWrite] }, async (req) => {
    const body = parse(
      z.object({
        itemId: z.string(),
        fromLocationId: z.string(),
        toLocationId: z.string(),
        qty: z.coerce.number().positive(),
        lotId: z.string().optional().nullable(),
        serial: z.string().optional().nullable(),
      }),
      req.body,
    )
    const { moveStock } = await import('../lib/inventory')
    const chunks = await prisma.$transaction(async (tx) =>
      moveStock(tx, {
        ...body,
        type: 'PUTAWAY',
        refType: 'PUTAWAY',
        userId: req.auth!.id,
        userName: req.auth!.name,
      }),
    )
    await audit(req, 'PUTAWAY', 'Stock', body.itemId, body)
    await emitEvent('putaway.confirmed', { ...body, user: req.auth!.name })
    return { ok: true, chunks }
  })
}
