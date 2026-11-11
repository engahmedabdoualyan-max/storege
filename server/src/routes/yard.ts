import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { ApiError, pagination, parse } from '../lib/http.js'
import { canWrite } from '../lib/auth.js'
import { audit } from '../lib/audit.js'

export async function yardRoutes(app: FastifyInstance) {
  app.get('/api/yard', async (req) => {
    const q = req.query as Record<string, string>
    const { page, pageSize, skip, take } = pagination(q)
    const where: Record<string, unknown> = {}
    if (q.warehouseId) where.warehouseId = q.warehouseId
    if (q.status) where.status = q.status
    const [items, total] = await Promise.all([
      prisma.yardSpot.findMany({ where, include: { warehouse: true }, orderBy: { code: 'asc' }, skip, take }),
      prisma.yardSpot.count({ where }),
    ])
    return { items, total, page, pageSize }
  })

  app.post('/api/yard', { preHandler: [canWrite] }, async (req) => {
    const body = parse(z.object({
      warehouseId: z.string().min(1),
      code: z.string().min(1),
      status: z.enum(['EMPTY', 'OCCUPIED']).optional(),
      trailerPlate: z.string().optional().nullable(),
    }), req.body)
    const spot = await prisma.yardSpot.create({
      data: {
        warehouseId: body.warehouseId,
        code: body.code,
        status: body.status || 'EMPTY',
        trailerPlate: body.trailerPlate || null,
        arrivalAt: body.status === 'OCCUPIED' ? new Date() : null,
      },
      include: { warehouse: true },
    })
    await audit(req, 'CREATE', 'YardSpot', spot.id, { code: body.code })
    return spot
  })

  app.patch('/api/yard/:id', { preHandler: [canWrite] }, async (req) => {
    const { id } = req.params as { id: string }
    const body = parse(z.object({
      status: z.enum(['EMPTY', 'OCCUPIED']).optional(),
      trailerPlate: z.string().optional().nullable(),
    }), req.body)
    const data: Record<string, unknown> = {}
    if (body.status) {
      data.status = body.status
      data.arrivalAt = body.status === 'OCCUPIED' ? new Date() : null
      if (body.status === 'EMPTY') data.trailerPlate = null
    }
    if (body.trailerPlate !== undefined) data.trailerPlate = body.trailerPlate
    return prisma.yardSpot.update({ where: { id }, data, include: { warehouse: true } })
  })

  app.delete('/api/yard/:id', { preHandler: [canWrite] }, async (req) => {
    const { id } = req.params as { id: string }
    await prisma.yardSpot.delete({ where: { id } })
    await audit(req, 'DELETE', 'YardSpot', id, {})
    return { ok: true }
  })
}
