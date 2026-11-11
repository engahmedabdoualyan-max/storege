import type { FastifyInstance } from 'fastify'
import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { audit } from '../lib/audit'
import { ApiError, pagination, parse, toCsv } from '../lib/http'
import { adminOnly, canManage } from '../lib/auth'
import { getSettings, updateSettings } from '../lib/settings'
import { hashToken } from '../lib/auth'
import { testEndpoint, processPendingDeliveries } from '../lib/webhooks'

export async function platformRoutes(app: FastifyInstance) {
  // ------------------------------------------------------------- settings
  app.get('/api/settings', async () => getSettings(true))

  app.patch('/api/settings', { preHandler: [canManage] }, async (req) => {
    const body = parse(z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])), req.body)
    const values: Record<string, string> = {}
    for (const [key, value] of Object.entries(body)) values[key] = String(value)
    if (values.logoUrl && values.logoUrl.length > 900000) {
      throw new ApiError(400, 'حجم الشعار كبير جدًا (الحد 650KB)')
    }
    const settings = await updateSettings(values)
    await audit(req, 'UPDATE', 'Setting', null, Object.keys(values))
    return settings
  })

  // -------------------------------------------------------------- API keys
  app.get('/api/tokens', { preHandler: [adminOnly] }, async () => {
    return prisma.apiToken.findMany({
      select: {
        id: true,
        name: true,
        prefix: true,
        scopes: true,
        active: true,
        lastUsedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })
  })

  app.post('/api/tokens', { preHandler: [adminOnly] }, async (req) => {
    const body = parse(
      z.object({ name: z.string().min(1), scopes: z.enum(['*', 'manage', 'write', 'read']).default('read') }),
      req.body,
    )
    const raw = `stg_${randomBytes(24).toString('hex')}`
    const token = await prisma.apiToken.create({
      data: {
        name: body.name,
        prefix: raw.slice(0, 12),
        tokenHash: hashToken(raw),
        scopes: body.scopes,
        createdById: req.auth!.id,
      },
    })
    await audit(req, 'CREATE', 'ApiToken', token.id, { name: token.name, scopes: token.scopes })
    return { ...token, token: raw }
  })

  app.delete('/api/tokens/:id', { preHandler: [adminOnly] }, async (req) => {
    const { id } = req.params as { id: string }
    await prisma.apiToken.delete({ where: { id } })
    await audit(req, 'DELETE', 'ApiToken', id)
    return { ok: true }
  })

  // -------------------------------------------------------------- webhooks
  app.get('/api/webhooks', { preHandler: [canManage] }, async () => {
    return prisma.webhookEndpoint.findMany({
      include: { _count: { select: { deliveries: true } } },
      orderBy: { createdAt: 'desc' },
    })
  })

  app.post('/api/webhooks', { preHandler: [adminOnly] }, async (req) => {
    const body = parse(
      z.object({
        name: z.string().min(1),
        url: z.string().url(),
        events: z.string().default('*'),
        secret: z.string().optional(),
      }),
      req.body,
    )
    const endpoint = await prisma.webhookEndpoint.create({
      data: {
        name: body.name,
        url: body.url,
        events: body.events || '*',
        secret: body.secret || randomBytes(24).toString('hex'),
      },
    })
    await audit(req, 'CREATE', 'WebhookEndpoint', endpoint.id, { url: endpoint.url })
    return endpoint
  })

  app.patch('/api/webhooks/:id', { preHandler: [adminOnly] }, async (req) => {
    const { id } = req.params as { id: string }
    const body = parse(
      z.object({
        name: z.string().min(1).optional(),
        url: z.string().url().optional(),
        events: z.string().optional(),
        active: z.boolean().optional(),
      }),
      req.body,
    )
    return prisma.webhookEndpoint.update({ where: { id }, data: body })
  })

  app.delete('/api/webhooks/:id', { preHandler: [adminOnly] }, async (req) => {
    const { id } = req.params as { id: string }
    await prisma.webhookEndpoint.delete({ where: { id } })
    await audit(req, 'DELETE', 'WebhookEndpoint', id)
    return { ok: true }
  })

  app.get('/api/webhooks/:id/deliveries', { preHandler: [canManage] }, async (req) => {
    const { id } = req.params as { id: string }
    const q = req.query as Record<string, string>
    const { page, pageSize, skip, take } = pagination(q)
    const where: Record<string, unknown> = { endpointId: id }
    if (q.status) where.status = q.status
    const [items, total] = await Promise.all([
      prisma.webhookDelivery.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.webhookDelivery.count({ where }),
    ])
    return { items, total, page, pageSize }
  })

  app.post('/api/webhooks/:id/test', { preHandler: [adminOnly] }, async (req) => {
    const { id } = req.params as { id: string }
    const result = await testEndpoint(id)
    await audit(req, 'TEST', 'WebhookEndpoint', id, result)
    return result
  })

  app.post('/api/webhooks/deliveries/:id/retry', { preHandler: [adminOnly] }, async (req) => {
    const { id } = req.params as { id: string }
    await prisma.webhookDelivery.update({
      where: { id },
      data: { status: 'PENDING', attempts: 0, nextAttemptAt: new Date(), error: null },
    })
    void processPendingDeliveries()
    return { ok: true }
  })

  // ---------------------------------------------------------------- audit
  app.get('/api/audit', { preHandler: [canManage] }, async (req) => {
    const q = req.query as Record<string, string>
    const { page, pageSize, skip, take } = pagination(q)
    const where: Record<string, unknown> = {}
    if (q.entity) where.entity = q.entity
    if (q.action) where.action = q.action
    if (q.userId) where.userId = q.userId
    if (q.q) {
      where.OR = [
        { userName: { contains: q.q } },
        { action: { contains: q.q } },
        { entity: { contains: q.q } },
        { details: { contains: q.q } },
      ]
    }
    if (q.from || q.to) {
      where.createdAt = {
        ...(q.from ? { gte: new Date(q.from) } : {}),
        ...(q.to ? { lte: new Date(new Date(q.to).setHours(23, 59, 59, 999)) } : {}),
      }
    }
    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
      prisma.auditLog.count({ where }),
    ])
    return { items, total, page, pageSize }
  })

  app.get('/api/audit/export.csv', { preHandler: [canManage] }, async (_req, reply) => {
    const logs = await prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 5000 })
    const rows = logs.map((l) => ({
      date: l.createdAt.toISOString(),
      user: l.userName,
      action: l.action,
      entity: l.entity,
      entityId: l.entityId,
      details: l.details,
      ip: l.ip,
    }))
    reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', 'attachment; filename="storege-audit.csv"')
    return toCsv(rows)
  })

  // ------------------------------------------------------------ operations
  app.get('/api/system/info', { preHandler: [canManage] }, async () => {
    const [items, warehouses, users, movements, invoices] = await Promise.all([
      prisma.item.count(),
      prisma.warehouse.count(),
      prisma.user.count(),
      prisma.stockMovement.count(),
      prisma.invoice.count(),
    ])
    return {
      version: '1.0.0',
      engine: 'Storege WMS',
      database: (process.env.DATABASE_URL || '').startsWith('file:') ? 'SQLite' : 'PostgreSQL',
      counts: { items, warehouses, users, movements, invoices },
      uptime: Math.floor(process.uptime()),
    }
  })
}
