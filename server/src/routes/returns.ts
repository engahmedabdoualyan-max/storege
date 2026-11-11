import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { audit } from '../lib/audit.js'
import { ApiError, num, pagination, parse, str } from '../lib/http.js'
import { canWrite } from '../lib/auth.js'
import { adjustStock } from '../lib/inventory.js'
import { nextNumber } from '../lib/numbers.js'

export async function returnRoutes(app: FastifyInstance) {
  app.get('/api/returns', async (req) => {
    const q = req.query as Record<string, string>
    const { page, pageSize, skip, take } = pagination(q)
    const where: Record<string, unknown> = {}
    if (q.type) where.type = q.type
    if (q.status) where.status = q.status
    if (q.warehouseId) where.warehouseId = q.warehouseId
    const [items, total] = await Promise.all([
      prisma.return.findMany({
        where,
        include: { lines: { include: { item: true, location: true } }, warehouse: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.return.count({ where }),
    ])
    return { items, total, page, pageSize }
  })

  app.get('/api/returns/:id', async (req) => {
    const { id } = req.params as { id: string }
    const ret = await prisma.return.findUnique({
      where: { id },
      include: { lines: { include: { item: true, location: true } }, warehouse: true },
    })
    if (!ret) throw new ApiError(404, 'المرتجع غير موجود')
    return ret
  })

  app.post('/api/returns', { preHandler: [canWrite] }, async (req) => {
    const body = parse(
      z.object({
        type: z.enum(['CUSTOMER', 'SUPPLIER']).default('CUSTOMER'),
        partnerName: z.string().min(1),
        partnerId: z.string().optional().nullable(),
        warehouseId: z.string().min(1),
        reason: z.string().optional().nullable(),
        notes: z.string().optional().nullable(),
        lines: z
          .array(
            z.object({
              itemId: z.string().min(1),
              qty: z.coerce.number().positive(),
              disposition: z.enum(['RESTOCK', 'SCRAP', 'QUARANTINE']).default('QUARANTINE'),
              locationId: z.string().optional().nullable(),
              notes: z.string().optional().nullable(),
            }),
          )
          .min(1),
      }),
      req.body,
    )
    const number = await nextNumber('RTN')
    const ret = await prisma.return.create({
      data: {
        number,
        type: body.type,
        partnerName: body.partnerName,
        partnerId: body.partnerId || null,
        warehouseId: body.warehouseId,
        reason: body.reason || null,
        notes: body.notes || null,
        createdById: (req as any).auth?.id || null,
        lines: {
          create: body.lines.map((l) => ({
            itemId: l.itemId,
            qty: l.qty,
            disposition: l.disposition,
            locationId: l.locationId || null,
            notes: l.notes || null,
          })),
        },
      },
      include: { lines: { include: { item: true, location: true } }, warehouse: true },
    })
    await audit(req, 'CREATE', 'Return', ret.id, { number: ret.number })
    return ret
  })

  app.post('/api/returns/:id/receive', { preHandler: [canWrite] }, async (req) => {
    const { id } = req.params as { id: string }
    const ret = await prisma.return.findUnique({ where: { id }, include: { lines: true } })
    if (!ret) throw new ApiError(404, 'المرتجع غير موجود')
    if (ret.status !== 'DRAFT') throw new ApiError(400, 'المرتجع ليس في حالة مسودة')

    await prisma.$transaction(async (tx) => {
      for (const line of ret.lines) {
        if (line.disposition === 'SCRAP') continue
        const locationId = line.locationId
        if (!locationId) throw new ApiError(400, `موقع مطلوب للصنف ${line.itemId}`)
        await adjustStock(tx as any, {
          itemId: line.itemId,
          locationId,
          qty: line.qty,
        })
      }
      await tx.return.update({ where: { id }, data: { status: 'RECEIVED' } })
    })
    await audit(req, 'RECEIVE', 'Return', id, { status: 'RECEIVED' })
    return prisma.return.findUnique({ where: { id }, include: { lines: { include: { item: true, location: true } }, warehouse: true } })
  })

  app.post('/api/returns/:id/complete', { preHandler: [canWrite] }, async (req) => {
    const { id } = req.params as { id: string }
    const ret = await prisma.return.findUnique({ where: { id } })
    if (!ret) throw new ApiError(404, 'المرتجع غير موجود')
    if (ret.status !== 'RECEIVED') throw new ApiError(400, 'يجب استلام المرتجع أولاً')
    await prisma.return.update({ where: { id }, data: { status: 'COMPLETED' } })
    await audit(req, 'COMPLETE', 'Return', id, { status: 'COMPLETED' })
    return prisma.return.findUnique({ where: { id }, include: { lines: { include: { item: true, location: true } }, warehouse: true } })
  })

  app.post('/api/returns/:id/cancel', { preHandler: [canWrite] }, async (req) => {
    const { id } = req.params as { id: string }
    await prisma.return.update({ where: { id }, data: { status: 'CANCELLED' } })
    await audit(req, 'CANCEL', 'Return', id, {})
    return { ok: true }
  })
}
