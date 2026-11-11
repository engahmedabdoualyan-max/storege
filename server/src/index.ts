import { buildApp } from './app.js'
import { env } from './lib/env.js'
import { prisma } from './lib/prisma.js'
import { processPendingDeliveries } from './lib/webhooks.js'

const app = await buildApp()

setInterval(() => void processPendingDeliveries(), 30_000).unref()
void processPendingDeliveries()

const close = async () => {
  await app.close()
  await prisma.$disconnect()
  process.exit(0)
}
process.on('SIGINT', close)
process.on('SIGTERM', close)

try {
  await app.listen({ port: env.port, host: env.host })
  app.log.warn(`Storege WMS API running on http://localhost:${env.port}`)
} catch (error) {
  app.log.error(error)
  process.exit(1)
}
