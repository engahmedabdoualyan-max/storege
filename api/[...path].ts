import { buildApp } from '../server/src/app'

let appPromise: ReturnType<typeof buildApp> | null = null

/**
 * Vercel serverless entry point. Every /api/* request is routed here and handed
 * to the same Fastify instance used by the standalone server.
 */
export default async function handler(req: any, res: any) {
  if (!appPromise) appPromise = buildApp()
  const app = await appPromise
  await app.ready()
  app.server.emit('request' as any, req, res)
}
