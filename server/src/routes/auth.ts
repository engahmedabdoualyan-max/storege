import type { FastifyInstance } from 'fastify'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { audit } from '../lib/audit.js'
import { ApiError, parse } from '../lib/http.js'
import { env } from '../lib/env.js'

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export async function authRoutes(app: FastifyInstance) {
  app.post(
    '/api/auth/login',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (req) => {
      const body = parse(loginSchema, req.body)
      const user = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } })
      if (!user || !user.active) throw new ApiError(401, 'بيانات الدخول غير صحيحة')
      const ok = await bcrypt.compare(body.password, user.passwordHash)
      if (!ok) throw new ApiError(401, 'بيانات الدخول غير صحيحة')
      await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
      const token = app.jwt.sign(
        { sub: user.id, name: user.name, email: user.email, role: user.role },
        { expiresIn: env.jwtExpiresIn },
      )
      await audit(req, 'LOGIN', 'User', user.id, { email: user.email })
      return {
        token,
        user: { id: user.id, name: user.name, email: user.email, role: user.role, phone: user.phone },
      }
    },
  )

  app.get('/api/auth/me', async (req) => {
    const user = await prisma.user.findUnique({ where: { id: req.auth!.id } })
    if (!user) throw new ApiError(404, 'المستخدم غير موجود')
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone,
    }
  })

  app.post('/api/auth/change-password', async (req) => {
    const body = parse(
      z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8) }),
      req.body,
    )
    const user = await prisma.user.findUnique({ where: { id: req.auth!.id } })
    if (!user) throw new ApiError(404, 'المستخدم غير موجود')
    const ok = await bcrypt.compare(body.currentPassword, user.passwordHash)
    if (!ok) throw new ApiError(400, 'كلمة المرور الحالية غير صحيحة')
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(body.newPassword, 10) },
    })
    await audit(req, 'CHANGE_PASSWORD', 'User', user.id)
    return { ok: true }
  })
}
