import { createHmac } from 'node:crypto'
import { prisma } from './prisma'

const MAX_ATTEMPTS = 6
let running = false

type DeliveryJob = { id: string; event: string; payload: string; attempts: number; endpointId: string }

export async function emitEvent(event: string, data: unknown) {
  try {
    const endpoints = await prisma.webhookEndpoint.findMany({ where: { active: true } })
    if (!endpoints.length) return
    const payload = JSON.stringify({ event, timestamp: new Date().toISOString(), data })
    const deliveries: DeliveryJob[] = []
    for (const endpoint of endpoints) {
      const events = endpoint.events.split(',').map((e) => e.trim())
      if (!events.includes('*') && !events.includes(event)) continue
      const delivery = await prisma.webhookDelivery.create({
        data: { endpointId: endpoint.id, event, payload },
      })
      deliveries.push({
        id: delivery.id,
        event,
        payload,
        attempts: 0,
        endpointId: endpoint.id,
      })
    }
    for (const delivery of deliveries) void send(delivery)
  } catch {
    // Webhooks are best-effort and must never fail the triggering request.
  }
}

async function send(job: DeliveryJob) {
  const endpoint = await prisma.webhookEndpoint.findUnique({ where: { id: job.endpointId } })
  if (!endpoint || !endpoint.active) {
    await prisma.webhookDelivery.update({
      where: { id: job.id },
      data: { status: 'FAILED', error: 'Endpoint disabled' },
    })
    return
  }
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 7000)
    const signature = createHmac('sha256', endpoint.secret).update(job.payload).digest('hex')
    const response = await fetch(endpoint.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-storege-event': job.event,
        'x-storege-signature': `sha256=${signature}`,
      },
      body: job.payload,
      signal: controller.signal,
    })
    clearTimeout(timer)
    const attempts = job.attempts + 1
    if (response.ok) {
      await prisma.webhookDelivery.update({
        where: { id: job.id },
        data: {
          status: 'SUCCESS',
          attempts,
          responseCode: response.status,
          deliveredAt: new Date(),
          error: null,
          nextAttemptAt: null,
        },
      })
    } else {
      await retry(job, attempts, response.status, `HTTP ${response.status}`)
    }
  } catch (error) {
    await retry(job, job.attempts + 1, null, error instanceof Error ? error.message : 'Network error')
  }
}

async function retry(job: DeliveryJob, attempts: number, code: number | null, error: string) {
  const failed = attempts >= MAX_ATTEMPTS
  await prisma.webhookDelivery.update({
    where: { id: job.id },
    data: {
      status: failed ? 'FAILED' : 'PENDING',
      attempts,
      responseCode: code,
      error: error.slice(0, 500),
      nextAttemptAt: failed ? null : new Date(Date.now() + Math.min(60, 2 ** attempts) * 1000),
    },
  })
}

export async function processPendingDeliveries() {
  if (running) return
  running = true
  try {
    const pending = await prisma.webhookDelivery.findMany({
      where: {
        status: 'PENDING',
        attempts: { lt: MAX_ATTEMPTS },
        OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }],
      },
      take: 20,
      orderBy: { createdAt: 'asc' },
    })
    for (const delivery of pending) {
      await send({
        id: delivery.id,
        event: delivery.event,
        payload: delivery.payload,
        attempts: delivery.attempts,
        endpointId: delivery.endpointId,
      })
    }
  } finally {
    running = false
  }
}

export async function testEndpoint(endpointId: string) {
  const endpoint = await prisma.webhookEndpoint.findUnique({ where: { id: endpointId } })
  if (!endpoint) return { ok: false, error: 'Endpoint not found' }
  const payload = JSON.stringify({
    event: 'ping',
    timestamp: new Date().toISOString(),
    data: { message: 'Storege WMS webhook test' },
  })
  try {
    const signature = createHmac('sha256', endpoint.secret).update(payload).digest('hex')
    const response = await fetch(endpoint.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-storege-event': 'ping',
        'x-storege-signature': `sha256=${signature}`,
      },
      body: payload,
    })
    return { ok: response.ok, status: response.status }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Network error' }
  }
}
