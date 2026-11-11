import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { audit } from '../lib/audit'
import { ApiError, pagination, parse } from '../lib/http'
import { canWrite } from '../lib/auth'
import { createCycleCount, submitCycleCount } from '../lib/inventory'
import { emitEvent } from '../lib/webhooks'

export async function cycleCountRoutes(app: FastifyInstance) {
  app.get('/api/cycle-counts', async (req) => {
    const q = req.query as Record<string, string>
    const { page, pageSize, skip, take } = pagination(q)
    const where: Record<string, unknown> = {}
    if (q.status) where.status = q.status
    if (q.warehouseId) where.warehouseId = q.warehouseId
    if (q.q) where.number = { contains: q.q }
    const [items, total] = await Promise.all([
      prisma.cycleCount.findMany({
        where,
        include: { warehouse: true, _count: { select: { lines: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.cycleCount.count({ where }),
    ])
    return { items, total, page, pageSize }
  })

  app.get('/api/cycle-counts/:id', async (req) => {
    const { id } = req.params as { id: string }
    const count = await prisma.cycleCount.findUnique({
      where: { id },
      include: {
        warehouse: true,
        lines: {
          include: { item: true, location: true, lot: true },
          orderBy: [{ location: { code: 'asc' } }, { item: { name: 'asc' } }],
        },
      },
    })
    if (!count) throw new ApiError(404, 'الجرد غير موجود')
    const user = count.createdById
      ? await prisma.user.findUnique({ where: { id: count.createdById }, select: { name: true } })
      : null
    return { ...count, createdByName: user?.name || null }
  })

  app.post('/api/cycle-counts', { preHandler: [canWrite] }, async (req) => {
    const body = parse(
      z.object({
        warehouseId: z.string(),
        locationId: z.string().optional().nullable(),
        itemId: z.string().optional().nullable(),
        notes: z.string().optional().nullable(),
      }),
      req.body,
    )
    const count = await createCycleCount({
      warehouseId: body.warehouseId,
      locationId: body.locationId,
      itemId: body.itemId,
      notes: body.notes || undefined,
      createdById: req.auth!.id,
    })
    await audit(req, 'CREATE', 'CycleCount', count.id, { number: count.number, lines: count.lines.length })
    return count
  })

  app.patch('/api/cycle-counts/:id/lines', { preHandler: [canWrite] }, async (req) => {
    const { id } = req.params as { id: string }
    const body = parse(
      z.object({
        lines: z
          .array(
            z.object({
              lineId: z.string(),
              countedQty: z.coerce.number().min(0).nullable(),
            }),
          )
          .min(1),
      }),
      req.body,
    )
    const count = await prisma.cycleCount.findUnique({ where: { id } })
    if (!count) throw new ApiError(404, 'الجرد غير موجود')
    if (count.status !== 'OPEN') throw new ApiError(409, 'تم إنهاء الجرد')
    for (const line of body.lines) {
      await prisma.cycleCountLine.updateMany({
        where: { id: line.lineId, countId: id },
        data: { countedQty: line.countedQty },
      })
    }
    const lines = await prisma.cycleCountLine.findMany({
      where: { countId: id },
      include: { item: true, location: true, lot: true },
      orderBy: [{ location: { code: 'asc' } }, { item: { name: 'asc' } }],
    })
    return { lines }
  })

  app.post('/api/cycle-counts/:id/submit', { preHandler: [canWrite] }, async (req) => {
    const { id } = req.params as { id: string }
    const count = await submitCycleCount(id, req.auth!.id, req.auth!.name)
    await audit(req, 'SUBMIT', 'CycleCount', id)
    await emitEvent('cycle_count.completed', { countId: id, number: count.number })
    return count
  })

  app.post('/api/cycle-counts/:id/cancel', { preHandler: [canWrite] }, async (req) => {
    const { id } = req.params as { id: string }
    const count = await prisma.cycleCount.findUnique({ where: { id } })
    if (!count) throw new ApiError(404, 'الجرد غير موجود')
    if (count.status !== 'OPEN') throw new ApiError(409, 'لا يمكن إلغاء جرد مكتمل')
    const updated = await prisma.cycleCount.update({ where: { id }, data: { status: 'CANCELLED' } })
    await audit(req, 'CANCEL', 'CycleCount', id)
    return updated
  })
}
