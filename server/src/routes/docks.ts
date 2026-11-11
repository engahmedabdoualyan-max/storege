import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { audit } from '../lib/audit.js'
import { ApiError, pagination, parse, str } from '../lib/http.js'
import { canWrite } from '../lib/auth.js'
import { nextNumber } from '../lib/numbers.js'

export async function dockRoutes(app: FastifyInstance) {
  app.get('/api/docks', async (req) => {
    const q = req.query as Record<string, string>
    const { page, pageSize, skip, take } = pagination(q)
    const where: Record<string, unknown> = {}
    if (q.warehouseId) where.warehouseId = q.warehouseId
    if (q.status) where.status = q.status
    const [items, total] = await Promise.all([
      prisma.dockAppointment.findMany({
        where,
        include: { warehouse: true, dock: true },
        orderBy: { appointmentAt: 'asc' },
        skip,
        take,
      }),
      prisma.dockAppointment.count({ where }),
    ])
    return { items, total, page, pageSize }
  })

  app.post('/api/docks', { preHandler: [canWrite] }, async (req) => {
    const body = parse(
      z.object({
        warehouseId: z.string().min(1),
        dockLocationId: z.string().optional().nullable(),
        carrierName: z.string().optional().nullable(),
        truckPlate: z.string().optional().nullable(),
        appointmentAt: z.string().min(1),
        notes: z.string().optional().nullable(),
      }),
      req.body,
    )
    const number = await nextNumber('DCK')
    const appt = await prisma.dockAppointment.create({
      data: {
        number,
        warehouseId: body.warehouseId,
        dockLocationId: body.dockLocationId || null,
        carrierName: body.carrierName || null,
        truckPlate: body.truckPlate || null,
        appointmentAt: new Date(body.appointmentAt),
        notes: body.notes || null,
        createdById: (req as any).auth?.id || null,
      },
      include: { warehouse: true, dock: true },
    })
    await audit(req, 'CREATE', 'DockAppointment', appt.id, { number: appt.number })
    return appt
  })

  app.patch('/api/docks/:id', { preHandler: [canWrite] }, async (req) => {
    const { id } = req.params as { id: string }
    const body = parse(
      z.object({
        status: z.enum(['SCHEDULED', 'ARRIVED', 'DOCKED', 'COMPLETED', 'CANCELLED']).optional(),
        dockLocationId: z.string().optional().nullable(),
        notes: z.string().optional().nullable(),
      }),
      req.body,
    )
    const appt = await prisma.dockAppointment.update({
      where: { id },
      data: {
        ...(body.status ? { status: body.status } : {}),
        ...(body.dockLocationId !== undefined ? { dockLocationId: body.dockLocationId } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
      },
      include: { warehouse: true, dock: true },
    })
    await audit(req, 'UPDATE', 'DockAppointment', id, body)
    return appt
  })

  app.delete('/api/docks/:id', { preHandler: [canWrite] }, async (req) => {
    const { id } = req.params as { id: string }
    await prisma.dockAppointment.delete({ where: { id } })
    await audit(req, 'DELETE', 'DockAppointment', id, {})
    return { ok: true }
  })
}
