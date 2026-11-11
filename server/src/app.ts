import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import rateLimit from '@fastify/rate-limit'
import fastifyStatic from '@fastify/static'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ZodError } from 'zod'
import { prisma } from './lib/prisma'
import { ApiError } from './lib/http'
import { authenticate } from './lib/auth'
import { env } from './lib/env'
import { processPendingDeliveries } from './lib/webhooks'
import { authRoutes } from './routes/auth'
import { userRoutes } from './routes/users'
import { itemRoutes } from './routes/items'
import { warehouseRoutes } from './routes/warehouses'
import { inventoryRoutes } from './routes/inventory'
import { partnerRoutes } from './routes/partners'
import { purchaseOrderRoutes } from './routes/purchaseOrders'
import { salesOrderRoutes } from './routes/salesOrders'
import { transferRoutes } from './routes/transfers'
import { cycleCountRoutes } from './routes/cycleCounts'
import { invoiceRoutes } from './routes/invoices'
import { dashboardRoutes } from './routes/dashboard'
import { reportRoutes } from './routes/reports'
import { platformRoutes } from './routes/platform'

const PUBLIC_PATHS = new Set(['/api/auth/login', '/api/health', '/api/settings/public'])

declare module 'fastify' {
  interface FastifyRequest {
    opId?: string
  }
}

export async function buildApp() {
  const app = Fastify({
  logger: {
    level: env.isProd ? 'info' : 'warn',
  },
  trustProxy: env.trustProxy,
  bodyLimit: 12 * 1024 * 1024,
})

await app.register(cors, {
  origin: env.corsOrigin === '*' ? true : env.corsOrigin.split(',').map((o) => o.trim()),
  credentials: true,
  exposedHeaders: ['x-idempotent-replay'],
})

await app.register(jwt, { secret: env.jwtSecret })
await app.register(rateLimit, {
  max: 900,
  timeWindow: '1 minute',
  allowList: (req) => req.url === '/api/health',
})

app.setErrorHandler((error, req, reply) => {
  if (error instanceof ApiError) {
    return reply.status(error.statusCode).send({ error: error.message, details: error.details })
  }
  if (error instanceof ZodError) {
    return reply.status(400).send({ error: 'بيانات غير صحيحة / Invalid data', details: error.flatten() })
  }
  const prismaError = error as { code?: string; meta?: unknown }
  if (prismaError.code === 'P2002') {
    return reply.status(409).send({ error: 'قيمة مكررة غير مسموح بها / Duplicate value' })
  }
  if (prismaError.code === 'P2025') {
    return reply.status(404).send({ error: 'السجل غير موجود / Record not found' })
  }
  req.log.error(error)
  return reply.status(500).send({
    error: env.isProd ? 'حدث خطأ غير متوقع / Internal server error' : error instanceof Error ? error.message : String(error),
  })
})

app.addHook('onRequest', async (req) => {
  if (req.method === 'OPTIONS') return
  const url = req.url.split('?')[0]
  if (!url.startsWith('/api/')) return
  if (PUBLIC_PATHS.has(url)) return
  await authenticate(req)
})

// Offline-first idempotency: clients send X-Op-Id (or clientOpId in the body)
// and retries replay the stored response instead of applying the operation twice.
app.addHook('preHandler', async (req, reply) => {
  if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) return
  const header = req.headers['x-op-id']
  const body = req.body as { clientOpId?: string } | undefined
  const opId = typeof header === 'string' ? header : body?.clientOpId
  if (!opId || !/^[a-zA-Z0-9_-]{8,80}$/.test(opId)) return
  const existing = await prisma.processedOperation.findUnique({ where: { id: opId } })
  if (existing) {
    reply.header('x-idempotent-replay', 'true')
    return reply.status(200).send(JSON.parse(existing.result))
  }
  req.opId = opId
})

app.addHook('onSend', async (req, reply, payload) => {
  if (!req.opId || reply.statusCode >= 400) return payload
  const result = typeof payload === 'string' ? payload : JSON.stringify(payload)
  try {
    await prisma.processedOperation.create({
      data: {
        id: req.opId,
        endpoint: req.url,
        userId: req.auth?.id || null,
        result,
      },
    })
  } catch {
    // Duplicate op id handled elsewhere; never fail the response.
  }
  return payload
})

app.get('/api/health', async () => {
  try {
    await prisma.user.count()
    return {
      status: 'ok',
      service: 'storege-wms',
      version: '1.0.0',
      time: new Date().toISOString(),
    }
  } catch (error) {
    return {
      status: 'degraded',
      error: error instanceof Error ? error.message : 'unknown',
      time: new Date().toISOString(),
    }
  }
})

await app.register(authRoutes)
await app.register(userRoutes)
await app.register(itemRoutes)
await app.register(warehouseRoutes)
await app.register(inventoryRoutes)
await app.register(partnerRoutes)
await app.register(purchaseOrderRoutes)
await app.register(salesOrderRoutes)
await app.register(transferRoutes)
await app.register(cycleCountRoutes)
await app.register(invoiceRoutes)
await app.register(dashboardRoutes)
await app.register(reportRoutes)
await app.register(platformRoutes)

const here = path.dirname(fileURLToPath(import.meta.url))
const candidates = [
  path.resolve(here, '../../web/dist'),
  path.resolve(process.cwd(), '../web/dist'),
  path.resolve(process.cwd(), 'web/dist'),
]
const webDist = candidates.find((p) => existsSync(path.join(p, 'index.html')))

if (webDist) {
  await app.register(fastifyStatic, { root: webDist, prefix: '/' })
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/')) {
      return reply.status(404).send({ error: 'المسار غير موجود / Not found' })
    }
    return reply.sendFile('index.html')
  })
} else {
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/')) {
      return reply.status(404).send({ error: 'المسار غير موجود / Not found' })
    }
    return reply
      .type('text/html; charset=utf-8')
      .send(
        '<html dir="rtl"><body style="font-family:sans-serif;padding:40px"><h1>Storege WMS API</h1><p>واجهة الويب غير مبنية بعد. شغّل <code>npm run build</code> أو استخدم Vite على المنفذ 5173.</p><p><a href="/api/health">/api/health</a></p></body></html>',
      )
  })
}


  return app
}

export async function processDeliveries() {
  await processPendingDeliveries()
}
