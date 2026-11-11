import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { audit } from '../lib/audit.js'
import { ApiError, pagination, parse } from '../lib/http.js'
import { canWrite } from '../lib/auth.js'
import { nextNumber } from '../lib/numbers.js'
import { dispatchTransfer, receiveTransfer } from '../lib/inventory.js'
import { emitEvent } from '../lib/webhooks.js'

export async function transferRoutes(app: FastifyInstance) {
  app.get('/api/transfers', async (req) => {
    const q = req.query as Record<string, string>
    const { page, pageSize, skip, take } = pagination(q)
    const where: Record<string, unknown> = {}
    if (q.status) where.status = q.status
    if (q.warehouseId) {
      where.OR = [{ fromWarehouseId: q.warehouseId }, { toWarehouseId: q.warehouseId }]
    }
    if (q.q) where.number = { contains: q.q }
    const [items, total] = await Promise.all([
      prisma.transfer.findMany({
        where,
        include: {
          fromWarehouse: true,
          toWarehouse: true,
          lines: { include: { item: true, lot: true, fromLocation: true, toLocation: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.transfer.count({ where }),
    ])
    return { items, total, page, pageSize }
  })

  app.get('/api/transfers/:id', async (req) => {
    const { id } = req.params as { id: string }
    const transfer = await prisma.transfer.findUnique({
      where: { id },
      include: {
        fromWarehouse: true,
        toWarehouse: true,
        lines: {
          include: {
            item: true,
            lot: true,
            fromLocation: true,
            toLocation: true,
          },
        },
      },
    })
    if (!transfer) throw new ApiError(404, 'أمر التحويل غير موجود')
    return transfer
  })

  app.post('/api/transfers', { preHandler: [canWrite] }, async (req) => {
    const body = parse(
      z.object({
        fromWarehouseId: z.string(),
        toWarehouseId: z.string(),
        notes: z.string().optional().nullable(),
        lines: z
          .array(
            z.object({
              itemId: z.string(),
              qty: z.coerce.number().positive(),
              fromLocationId: z.string().optional().nullable(),
              toLocationId: z.string().optional().nullable(),
              lotId: z.string().optional().nullable(),
              lotCode: z.string().optional().nullable(),
            }),
          )
          .min(1),
      }),
      req.body,
    )
    if (body.fromWarehouseId === body.toWarehouseId) {
      throw new ApiError(400, 'لا يمكن التحويل لنفس المخزن')
    }
    const transfer = await prisma.$transaction(async (tx) => {
      const number = await nextNumber('TRF', tx)
      return tx.transfer.create({
        data: {
          number,
          fromWarehouseId: body.fromWarehouseId,
          toWarehouseId: body.toWarehouseId,
          notes: body.notes || null,
          createdById: req.auth!.id,
          lines: {
            create: body.lines.map((l) => ({
              itemId: l.itemId,
              qty: l.qty,
              fromLocationId: l.fromLocationId || null,
              toLocationId: l.toLocationId || null,
              lotId: l.lotId || null,
            })),
          },
        },
        include: {
          lines: { include: { item: true, lot: true, fromLocation: true, toLocation: true } },
          fromWarehouse: true,
          toWarehouse: true,
        },
      })
    })
    await audit(req, 'CREATE', 'Transfer', transfer.id, { number: transfer.number })
    return transfer
  })

  app.post('/api/transfers/:id/dispatch', { preHandler: [canWrite] }, async (req) => {
    const { id } = req.params as { id: string }
    const transfer = await dispatchTransfer(id, req.auth!.id, req.auth!.name)
    await audit(req, 'DISPATCH', 'Transfer', id)
    await emitEvent('transfer.dispatched', { transferId: id, number: transfer.number })
    return transfer
  })

  app.post('/api/transfers/:id/receive', { preHandler: [canWrite] }, async (req) => {
    const { id } = req.params as { id: string }
    const transfer = await receiveTransfer(id, req.auth!.id, req.auth!.name)
    await audit(req, 'RECEIVE', 'Transfer', id)
    await emitEvent('transfer.received', { transferId: id, number: transfer.number })
    return transfer
  })

  app.post('/api/transfers/:id/cancel', { preHandler: [canWrite] }, async (req) => {
    const { id } = req.params as { id: string }
    const transfer = await prisma.transfer.findUnique({ where: { id } })
    if (!transfer) throw new ApiError(404, 'أمر التحويل غير موجود')
    if (transfer.status !== 'DRAFT') throw new ApiError(409, 'لا يمكن إلغاء تحويل تم صرفه')
    const updated = await prisma.transfer.update({ where: { id }, data: { status: 'CANCELLED' } })
    await audit(req, 'CANCEL', 'Transfer', id)
    return updated
  })
}
