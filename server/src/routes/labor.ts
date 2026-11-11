import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { ApiError, pagination, parse } from '../lib/http.js'
import { canWrite } from '../lib/auth.js'
import { audit } from '../lib/audit.js'

export async function laborRoutes(app: FastifyInstance) {
  app.get('/api/labor', async (req) => {
    const q = req.query as Record<string, string>
    const { page, pageSize, skip, take } = pagination(q)
    const where: Record<string, unknown> = {}
    if (q.userId) where.userId = q.userId
    if (q.taskType) where.taskType = q.taskType
    const [items, total] = await Promise.all([
      prisma.laborTask.findMany({ where, orderBy: { startedAt: 'desc' }, skip, take }),
      prisma.laborTask.count({ where }),
    ])
    return { items, total, page, pageSize }
  })

  app.post('/api/labor', { preHandler: [canWrite] }, async (req) => {
    const body = parse(z.object({
      taskType: z.string().min(1),
      refType: z.string().optional().nullable(),
      refId: z.string().optional().nullable(),
      qty: z.coerce.number().optional(),
      startedAt: z.string().optional(),
      endedAt: z.string().optional().nullable(),
    }), req.body)
    const started = body.startedAt ? new Date(body.startedAt) : new Date()
    const ended = body.endedAt ? new Date(body.endedAt) : null
    const duration = ended ? Math.round((ended.getTime() - started.getTime()) / 1000) : null
    const task = await prisma.laborTask.create({
      data: {
        userId: (req as any).auth.id,
        userName: (req as any).auth.name,
        taskType: body.taskType,
        refType: body.refType || null,
        refId: body.refId || null,
        qty: body.qty || 0,
        startedAt: started,
        endedAt: ended,
        durationSec: duration,
      },
    })
    await audit(req, 'CREATE', 'LaborTask', task.id, { taskType: body.taskType })
    return task
  })

  app.patch('/api/labor/:id', { preHandler: [canWrite] }, async (req) => {
    const { id } = req.params as { id: string }
    const body = parse(z.object({ endedAt: z.string().optional(), qty: z.coerce.number().optional() }), req.body)
    const existing = await prisma.laborTask.findUnique({ where: { id } })
    if (!existing) throw new ApiError(404, 'المهمة غير موجودة')
    const ended = body.endedAt ? new Date(body.endedAt) : new Date()
    const duration = Math.round((ended.getTime() - existing.startedAt.getTime()) / 1000)
    return prisma.laborTask.update({ where: { id }, data: { endedAt: ended, durationSec: duration, ...(body.qty !== undefined ? { qty: body.qty } : {}) } })
  })
}
