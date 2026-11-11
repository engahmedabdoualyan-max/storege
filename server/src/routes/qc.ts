import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { ApiError, pagination, parse } from '../lib/http.js'
import { canWrite } from '../lib/auth.js'
import { audit } from '../lib/audit.js'

export async function qcRoutes(app: FastifyInstance) {
  app.get('/api/qc', async (req) => {
    const q = req.query as Record<string, string>
    const { page, pageSize, skip, take } = pagination(q)
    const where: Record<string, unknown> = {}
    if (q.status) where.qcStatus = q.status
    const [items, total] = await Promise.all([
      prisma.receiptLine.findMany({
        where,
        include: { item: true, location: true, receipt: { include: { warehouse: true } } },
        orderBy: { id: 'desc' },
        skip,
        take,
      }),
      prisma.receiptLine.count({ where }),
    ])
    return { items, total, page, pageSize }
  })

  app.patch('/api/qc/:id', { preHandler: [canWrite] }, async (req) => {
    const { id } = req.params as { id: string }
    const body = parse(z.object({ qcStatus: z.enum(['PENDING', 'PASSED', 'FAILED']), qcNotes: z.string().optional().nullable() }), req.body)
    const line = await prisma.receiptLine.update({
      where: { id },
      data: { qcStatus: body.qcStatus, qcNotes: body.qcNotes ?? null },
      include: { item: true, location: true },
    })
    await audit(req, 'QC', 'ReceiptLine', id, body)
    return line
  })
}
