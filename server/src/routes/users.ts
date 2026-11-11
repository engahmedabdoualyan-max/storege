import type { FastifyInstance } from 'fastify'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { audit } from '../lib/audit.js'
import { ApiError, pagination, parse } from '../lib/http.js'
import { adminOnly, requireRole } from '../lib/auth.js'

const userSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['ADMIN', 'MANAGER', 'OPERATOR', 'VIEWER']),
  phone: z.string().optional().nullable(),
  active: z.boolean().optional(),
})

export async function userRoutes(app: FastifyInstance) {
  app.get('/api/users', { preHandler: [adminOnly] }, async (req) => {
    const q = req.query as Record<string, string>
    const { page, pageSize, skip, take } = pagination(q)
    const where = q.q
      ? { OR: [{ name: { contains: q.q } }, { email: { contains: q.q } }] }
      : {}
    const [items, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          phone: true,
          active: true,
          lastLoginAt: true,
          createdAt: true,
        },
      }),
      prisma.user.count({ where }),
    ])
    return { items, total, page, pageSize }
  })

  app.post('/api/users', { preHandler: [adminOnly] }, async (req) => {
    const body = parse(userSchema, req.body)
    const exists = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } })
    if (exists) throw new ApiError(409, 'البريد الإلكتروني مستخدم بالفعل')
    const user = await prisma.user.create({
      data: {
        name: body.name,
        email: body.email.toLowerCase(),
        passwordHash: await bcrypt.hash(body.password, 10),
        role: body.role,
        phone: body.phone || null,
        active: body.active ?? true,
      },
      select: { id: true, name: true, email: true, role: true, active: true },
    })
    await audit(req, 'CREATE', 'User', user.id, { email: user.email, role: user.role })
    return user
  })

  app.patch('/api/users/:id', { preHandler: [adminOnly] }, async (req) => {
    const { id } = req.params as { id: string }
    const body = parse(
      userSchema.partial().omit({ password: true }).extend({ password: z.string().min(8).optional() }),
      req.body,
    )
    const exists = await prisma.user.findUnique({ where: { id } })
    if (!exists) throw new ApiError(404, 'المستخدم غير موجود')
    if (id === req.auth!.id && body.active === false) {
      throw new ApiError(400, 'لا يمكنك تعطيل حسابك الحالي')
    }
    const user = await prisma.user.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.email ? { email: body.email.toLowerCase() } : {}),
        ...(body.role ? { role: body.role } : {}),
        ...(body.phone !== undefined ? { phone: body.phone } : {}),
        ...(body.active !== undefined ? { active: body.active } : {}),
        ...(body.password ? { passwordHash: await bcrypt.hash(body.password, 10) } : {}),
      },
      select: { id: true, name: true, email: true, role: true, active: true, phone: true },
    })
    await audit(req, 'UPDATE', 'User', id, { role: body.role, active: body.active })
    return user
  })

  app.delete('/api/users/:id', { preHandler: [adminOnly] }, async (req) => {
    const { id } = req.params as { id: string }
    if (id === req.auth!.id) throw new ApiError(400, 'لا يمكنك حذف حسابك الحالي')
    const user = await prisma.user.findUnique({ where: { id } })
    if (!user) throw new ApiError(404, 'المستخدم غير موجود')
    await prisma.user.update({ where: { id }, data: { active: false } })
    await audit(req, 'DEACTIVATE', 'User', id)
    return { ok: true }
  })
}
