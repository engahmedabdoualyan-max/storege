import { buildApp } from './app'
import { env } from './lib/env'
import { prisma } from './lib/prisma'
import { processPendingDeliveries } from './lib/webhooks'

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
