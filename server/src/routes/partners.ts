import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { audit } from '../lib/audit.js'
import { ApiError, pagination, parse } from '../lib/http.js'
import { canManage, canWrite } from '../lib/auth.js'

const partnerSchema = z.object({
  code: z.string().optional(),
  name: z.string().min(1),
  contact: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  address: z.string().optional().nullable(),
  taxNumber: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  active: z.boolean().optional(),
})

function registerPartnerRoutes(app: FastifyInstance, kind: 'supplier' | 'customer') {
  // Prisma's generated delegates for Supplier and Customer cannot be unioned
  // without losing their call signatures, so keep a narrow local alias.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const model: any = kind === 'supplier' ? prisma.supplier : prisma.customer
  app.get(`/api/${kind}s`, async (req) => {
    const q = req.query as Record<string, string>
    const { page, pageSize, skip, take } = pagination(q)
    const where = q.q
      ? {
          OR: [
            { name: { contains: q.q } },
            { code: { contains: q.q } },
            { phone: { contains: q.q } },
            { email: { contains: q.q } },
          ],
        }
      : {}
    const [items, total] = await Promise.all([
      model.findMany({ where, orderBy: { name: 'asc' }, skip, take }),
      model.count({ where }),
    ])
    return { items, total, page, pageSize }
  })

  app.get(`/api/${kind}s/all`, async () => model.findMany({ orderBy: { name: 'asc' } }))

  app.get(`/api/${kind}s/:id`, async (req) => {
    const { id } = req.params as { id: string }
    const partner = await model.findUnique({ where: { id } })
    if (!partner) throw new ApiError(404, 'السجل غير موجود')
    return partner
  })

  app.post(`/api/${kind}s`, { preHandler: [canWrite] }, async (req) => {
    const body = parse(partnerSchema, req.body)
    const code = body.code || `${kind === 'supplier' ? 'SUP' : 'CUS'}-${Date.now().toString().slice(-6)}`
    const dup = await model.findUnique({ where: { code } })
    if (dup) throw new ApiError(409, 'الكود مستخدم بالفعل')
    const data = {
      ...body,
      code,
      email: body.email || null,
      contact: body.contact || null,
      phone: body.phone || null,
      address: body.address || null,
      taxNumber: body.taxNumber || null,
      notes: body.notes || null,
    }
    const created = await model.create({ data })
    await audit(req, 'CREATE', kind === 'supplier' ? 'Supplier' : 'Customer', created.id, { name: created.name })
    return created
  })

  app.patch(`/api/${kind}s/:id`, { preHandler: [canWrite] }, async (req) => {
    const { id } = req.params as { id: string }
    const body = parse(partnerSchema.partial(), req.body)
    return model.update({
      where: { id },
      data: {
        ...(body.name ? { name: body.name } : {}),
        ...(body.code ? { code: body.code } : {}),
        ...(body.contact !== undefined ? { contact: body.contact } : {}),
        ...(body.phone !== undefined ? { phone: body.phone } : {}),
        ...(body.email !== undefined ? { email: body.email || null } : {}),
        ...(body.address !== undefined ? { address: body.address } : {}),
        ...(body.taxNumber !== undefined ? { taxNumber: body.taxNumber } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
        ...(body.active !== undefined ? { active: body.active } : {}),
      },
    })
  })

  app.delete(`/api/${kind}s/:id`, { preHandler: [canManage] }, async (req) => {
    const { id } = req.params as { id: string }
    const used =
      kind === 'supplier'
        ? await prisma.purchaseOrder.count({ where: { supplierId: id } })
        : await prisma.salesOrder.count({ where: { customerId: id } })
    if (used > 0) throw new ApiError(409, 'لا يمكن حذف سجل مرتبط بأوامر')
    await model.delete({ where: { id } })
    await audit(req, 'DELETE', kind === 'supplier' ? 'Supplier' : 'Customer', id)
    return { ok: true }
  })
}

export async function partnerRoutes(app: FastifyInstance) {
  registerPartnerRoutes(app, 'supplier')
  registerPartnerRoutes(app, 'customer')
}
