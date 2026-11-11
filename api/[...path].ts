/**
 * Vercel serverless entry point. Every /api/* request is routed here and handed
 * to the same Fastify instance used by the standalone server.
 */
export default async function handler(req: any, res: any) {
  const { buildApp } = await import('../server/src/app.js')
  // Reuse a single instance across invocations in the same container.
  const g = globalThis as any
  if (!g.__storegeApp) g.__storegeApp = buildApp()
  const app = await g.__storegeApp
  await app.ready()
  app.server.emit('request' as any, req, res)
}
